import io
import os
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework.test import APIClient, APITestCase

from .models import Case, CasePhoto, Match, Notification
from .services import notify_match

User = get_user_model()


def make_user(phone, role="family"):
    return User.objects.create_user(username=phone, phone=phone, password="pass-12345", role=role, first_name="T", age=30)


class FamilyApiTests(APITestCase):
    def setUp(self):
        self.me = make_user("01711111111")
        self.other = make_user("01722222222")
        self.client = APIClient()
        self.client.force_authenticate(self.me)
        self.case = Case.objects.create(owner=self.me, person_name="A")
        self.other_case = Case.objects.create(owner=self.other, person_name="B")

    def test_staff_and_anonymous_are_blocked(self):
        self.assertEqual(APIClient().get("/api/family/summary/").status_code, 401)
        staff = APIClient()
        staff.force_authenticate(make_user("01733333333", role="police"))
        self.assertEqual(staff.get("/api/family/summary/").status_code, 403)

    def test_summary_only_shows_own_data(self):
        m = Match.objects.create(case=self.case, score=90, found_place="H", contact_phone="017")
        Match.objects.create(case=self.other_case, score=99)
        notify_match(m)
        d = self.client.get("/api/family/summary/").json()
        self.assertEqual([c["person_name"] for c in d["cases"]], ["A"])
        self.assertEqual(d["cases"][0]["match_count"], 1)
        self.assertEqual(d["cases"][0]["best_score"], 90)
        self.assertEqual(len(d["matches"]), 1)
        self.assertEqual(d["alert"]["score"], 90)
        self.assertEqual(d["stats"], {"cases": 1, "matches": 1, "unread": 1})

    def test_deceased_match_is_masked_everywhere(self):
        m = Match.objects.create(case=self.case, score=95, record_kind="deceased",
                                 found_place="Morgue X", found_area="Y", contact_phone="01799999999")
        notify_match(m)
        d = self.client.get("/api/family/summary/").json()
        self.assertIsNone(d["cases"][0]["best_score"])  # no score leak through the case card
        row = d["matches"][0]
        self.assertEqual((row["score"], row["band"], row["found_place"], row["contact_phone"]), (None, "restricted", "", ""))
        self.assertEqual(d["alert"]["kind"], "officer")
        self.assertIsNone(d["alert"]["score"])
        self.assertNotIn("Morgue X", self.client.get("/api/family/notifications/").content.decode())

    def test_bands(self):
        self.assertEqual([Match(score=s).band for s in (85, 84, 60, 59)], ["high", "possible", "possible", "low"])

    def test_mark_read_only_touches_own(self):
        n1 = notify_match(Match.objects.create(case=self.case, score=70))
        n2 = notify_match(Match.objects.create(case=self.other_case, score=70))
        r = self.client.post("/api/family/notifications/read/", {"ids": [n1.id, n2.id]}, format="json")
        self.assertEqual(r.json(), {"updated": 1})
        n2.refresh_from_db()
        self.assertFalse(n2.is_read)

    def test_mark_all_read(self):
        notify_match(Match.objects.create(case=self.case, score=70))
        notify_match(Match.objects.create(case=self.case, score=80))
        self.assertEqual(self.client.post("/api/family/notifications/read/", {}, format="json").json(), {"updated": 2})

    def test_close_case_removes_everything(self):
        notify_match(Match.objects.create(case=self.case, score=70))
        self.assertEqual(self.client.delete(f"/api/family/cases/{self.case.id}/").status_code, 204)
        self.assertEqual((Case.objects.filter(owner=self.me).count(), Match.objects.filter(case_id=self.case.id).count(),
                          Notification.objects.filter(user=self.me).count()), (0, 0, 0))

    def test_cannot_close_someone_elses_case(self):
        self.assertEqual(self.client.delete(f"/api/family/cases/{self.other_case.id}/").status_code, 404)
        self.assertTrue(Case.objects.filter(pk=self.other_case.id).exists())


class ProfileTests(APITestCase):
    def setUp(self):
        self.me = make_user("01711111111")
        make_user("01722222222").__class__.objects.filter(phone="01722222222").update(email="taken@x.com")
        self.client = APIClient()
        self.client.force_authenticate(self.me)

    def test_patch_updates_allowed_fields_and_not_phone_or_role(self):
        r = self.client.patch("/api/auth/me/", {"full_name": " Nila ", "alt_phone": "০১৮১২৩৪৫৬৭৮", "division": "dhaka",
                                                 "address": "Mirpur", "phone": "01999999999", "role": "admin"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.me.refresh_from_db()
        self.assertEqual((self.me.first_name, self.me.alt_phone, self.me.division, self.me.phone, self.me.role),
                         ("Nila", "01812345678", "dhaka", "01711111111", "family"))

    def test_validation(self):
        for body in ({"age": 17}, {"email": "taken@x.com"}, {"alt_phone": "123"}, {"division": "mars"}, {"full_name": "  "}):
            self.assertEqual(self.client.patch("/api/auth/me/", body, format="json").status_code, 400, body)

    def test_own_email_can_be_resaved(self):
        self.me.email = "me@x.com"; self.me.save()
        self.assertEqual(self.client.patch("/api/auth/me/", {"email": "ME@x.com"}, format="json").status_code, 200)


def img(name="a.png", color=(200, 80, 20)):
    buf = io.BytesIO()
    Image.new("RGB", (40, 40), color).save(buf, "PNG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")


class FileCaseTests(APITestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self._ov = override_settings(PRIVATE_MEDIA_ROOT=self._tmp.name)
        self._ov.enable()
        self.addCleanup(self._ov.disable)
        self.me = make_user("01711111111")
        self.other = make_user("01722222222")
        self.client = APIClient()
        self.client.force_authenticate(self.me)

    def body(self, photos=3, docs=0, **extra):
        d = {"person_name": " Rahim ", "gender": "male", "relationship": "parent", "person_age": 60,
             "photos": photos if isinstance(photos, list) else [img(f"p{i}.png") for i in range(photos)], "documents": [img(f"d{i}.png") for i in range(docs)]}
        d.update(extra)
        return d

    def post(self, **kw):
        return self.client.post("/api/family/cases/", self.body(**kw), format="multipart")

    def test_files_a_case_with_three_photos_and_documents(self):
        r = self.post(docs=1, marks_type="scar", marks_detail="left arm", last_seen_place="Mirpur")
        self.assertEqual(r.status_code, 201, r.content)
        c = Case.objects.get(pk=r.json()["id"])
        self.assertEqual((c.person_name, c.owner, c.marks_type), ("Rahim", self.me, "scar"))
        self.assertEqual(c.photos.filter(kind="photo").count(), 3)
        self.assertEqual(c.photos.filter(kind="document").count(), 1)
        self.assertTrue(all(os.path.exists(p.image.path) for p in c.photos.all()))

    def test_needs_three_photos(self):
        self.assertEqual(self.post(photos=2).status_code, 400)
        self.assertEqual(self.post(photos=9).status_code, 400)
        self.assertEqual(Case.objects.count(), 0)

    def test_rejects_non_image_and_missing_fields(self):
        bad = SimpleUploadedFile("x.png", b"not an image", content_type="image/png")
        self.assertEqual(self.post(photos=[img(), img(), bad]).status_code, 400)
        self.assertEqual(self.post(gender="").status_code, 400)
        self.assertEqual(self.post(person_name="   ").status_code, 400)
        self.assertEqual(self.post(last_seen_at="2999-01-01T00:00:00Z").status_code, 400)
        self.assertEqual(Case.objects.count(), 0)

    def test_five_case_limit(self):
        for _ in range(5):
            self.assertEqual(self.post().status_code, 201)
        r = self.post()
        self.assertEqual((r.status_code, r.json()["code"]), (409, "limit"))

    def test_staff_cannot_file(self):
        staff = APIClient(); staff.force_authenticate(make_user("01733333333", role="police"))
        self.assertEqual(staff.post("/api/family/cases/", self.body(), format="multipart").status_code, 403)

    def test_photo_is_private_to_owner(self):
        cid = self.post().json()["id"]
        p = CasePhoto.objects.filter(case_id=cid).first()
        url = f"/api/family/cases/{cid}/photos/{p.id}/"
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(b"".join(r.streaming_content)[:4], b"\x89PNG")
        intruder = APIClient(); intruder.force_authenticate(self.other)
        self.assertEqual(intruder.get(url).status_code, 404)
        self.assertEqual(APIClient().get(url).status_code, 401)

    def test_summary_gives_thumbnail_and_closing_deletes_files(self):
        cid = self.post(docs=1).json()["id"]
        d = self.client.get("/api/family/summary/").json()
        first = CasePhoto.objects.filter(case_id=cid, kind="photo").first()
        self.assertEqual(d["cases"][0]["photo_id"], first.id)
        paths = [p.image.path for p in CasePhoto.objects.filter(case_id=cid)]
        self.assertEqual(len(paths), 4)
        self.assertEqual(self.client.delete(f"/api/family/cases/{cid}/").status_code, 204)
        self.assertEqual(CasePhoto.objects.count(), 0)
        self.assertFalse(any(os.path.exists(p) for p in paths))  # files are gone, not just rows
