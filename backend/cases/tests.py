import io
import json
import os
import tempfile
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient, APITestCase

from .models import AuditLog, CasePhoto, FoundRecord, MergeRequest, Match, MissingCase, Notification, RecordPhoto

User = get_user_model()
PW = "pass-12345-xyz"


def make_user(phone, role="family", **kw):
    return User.objects.create_user(username=phone, phone=phone, password=PW, role=role, first_name="T",
                                    age=30, organization=kw.pop("organization", "Org " + phone[-2:]), **kw)


def img(name="a.png", color=(200, 80, 20)):
    buf = io.BytesIO()
    Image.new("RGB", (40, 40), color).save(buf, "PNG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


MARK = [{"region": "left_arm", "part": "forearm", "type": "scar", "detail": "old"}]
CLOTHES = [{"item": "panjabi", "color": "white"}]


class Base(APITestCase):
    def setUp(self):
        cache.clear()
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        ov = override_settings(PRIVATE_MEDIA_ROOT=self._tmp.name)
        ov.enable()
        self.addCleanup(ov.disable)
        self.fam = make_user("01711111111")
        self.other_fam = make_user("01722222222")
        self.police = make_user("01733333333", "police")
        self.medical = make_user("01744444444", "medical")
        self.officer = make_user("01755555555", "officer")
        self.admin = make_user("01766666666", "admin")
        self.auditor = make_user("01777777777", "auditor")
        self.f, self.p, self.m = client_for(self.fam), client_for(self.police), client_for(self.medical)
        self.o = client_for(self.officer)

    def case_body(self, photos=3, docs=0, **extra):
        d = {"person_name": " Rahim ", "gender": "male", "relationship": "parent", "person_age": 60,
             "division": "dhaka", "marks": json.dumps(MARK), "clothing": json.dumps(CLOTHES),
             "traits": json.dumps({"skin": "brown", "hair": "grey"}),
             "photos": photos if isinstance(photos, list) else [img(f"p{i}.png") for i in range(photos)],
             "documents": [img(f"d{i}.png") for i in range(docs)]}
        d.update(extra)
        return d

    def post_case(self, client=None, **kw):
        return (client or self.f).post("/api/family/cases/", self.case_body(**kw), format="multipart")

    def record_body(self, **extra):
        d = {"condition": "mute", "gender": "male", "age_min": 55, "age_max": 65, "division": "dhaka",
             "marks": json.dumps(MARK), "clothing": json.dumps(CLOTHES), "traits": json.dumps({"skin": "brown", "hair": "grey"}),
             "found_place": "Mirpur Thana", "found_area": "Mirpur 1",
             "found_at": (timezone.now() - timedelta(hours=5)).isoformat(), "contact_phone": "০১৭০০০০০০০৩",
             "photos": [img("r.png")]}
        d.update(extra)
        return d

    def post_record(self, client=None, **kw):
        return (client or self.p).post("/api/reporter/records/", self.record_body(**kw), format="multipart")


class FamilyCaseTests(Base):
    def test_files_a_case_with_photos_and_documents(self):
        r = self.post_case(docs=1, belongings="umbrella", last_seen_place="Mirpur")
        self.assertEqual(r.status_code, 201, r.content)
        c = MissingCase.objects.get(pk=r.json()["id"])
        self.assertEqual((c.person_name, c.owner, c.marks[0]["type"]), ("Rahim", self.fam, "scar"))
        self.assertEqual(c.photos.filter(kind="photo").count(), 3)
        self.assertEqual(c.photos.filter(kind="document").count(), 1)
        self.assertTrue(all(os.path.exists(p.image.path) for p in c.photos.all()))
        self.assertTrue(AuditLog.objects.filter(action="create_case", target_id=c.id).exists())

    def test_validation(self):
        self.assertEqual(self.post_case(photos=2).status_code, 400)
        self.assertEqual(self.post_case(photos=9).status_code, 400)
        bad = SimpleUploadedFile("x.png", b"not an image", content_type="image/png")
        self.assertEqual(self.post_case(photos=[img(), img(), bad]).status_code, 400)
        self.assertEqual(self.post_case(gender="").status_code, 400)
        self.assertEqual(self.post_case(person_name="   ").status_code, 400)
        self.assertEqual(self.post_case(last_seen_at="2999-01-01T00:00:00Z").status_code, 400)
        self.assertEqual(self.post_case(marks=json.dumps([{"region": "left_arm", "part": "nose", "type": "scar"}])).status_code, 400)
        self.assertEqual(self.post_case(clothing="[{\"item\": \"spacesuit\"}]").status_code, 400)
        self.assertEqual(MissingCase.objects.count(), 0)

    def test_five_case_limit(self):
        for _ in range(5):
            self.assertEqual(self.post_case().status_code, 201)
        r = self.post_case()
        self.assertEqual((r.status_code, r.json()["code"]), (409, "limit"))

    def test_staff_cannot_file_and_family_cannot_report(self):
        self.assertEqual(self.post_case(client=self.p).status_code, 403)
        self.assertEqual(self.post_record(client=self.f).status_code, 403)
        self.assertEqual(APIClient().get("/api/family/summary/").status_code, 401)

    def test_photo_is_private_to_owner(self):
        cid = self.post_case().json()["id"]
        p = CasePhoto.objects.filter(case_id=cid).first()
        url = f"/api/photos/case/{p.id}/"
        r = self.f.get(url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(b"".join(r.streaming_content)[:4], b"\x89PNG")
        self.assertEqual(client_for(self.other_fam).get(url).status_code, 404)
        self.assertEqual(self.m.get(url).status_code, 404)  # medical teams do not browse family reports
        self.assertEqual(self.p.get(url).status_code, 200)  # police do
        self.assertEqual(self.o.get(url).status_code, 200)
        self.assertEqual(APIClient().get(url).status_code, 401)

    def test_close_case_removes_everything(self):
        cid = self.post_case(docs=1).json()["id"]
        self.post_record()
        paths = [p.image.path for p in CasePhoto.objects.filter(case_id=cid)]
        self.assertEqual(Match.objects.filter(case_id=cid).count(), 1)
        self.assertEqual(self.f.delete(f"/api/family/cases/{cid}/").status_code, 204)
        self.assertEqual((MissingCase.objects.count(), Match.objects.count(), CasePhoto.objects.count()), (0, 0, 0))
        self.assertFalse(any(os.path.exists(p) for p in paths))

    def test_cannot_touch_someone_elses_case(self):
        cid = self.post_case(client=client_for(self.other_fam)).json()["id"]
        self.assertEqual(self.f.delete(f"/api/family/cases/{cid}/").status_code, 404)
        self.assertEqual(self.f.get(f"/api/family/cases/{cid}/").status_code, 404)


class MatchingFlowTests(Base):
    def test_police_record_matches_family_case_and_notifies(self):
        cid = self.post_case().json()["id"]
        r = self.post_record()
        self.assertEqual(r.status_code, 201, r.content)
        rec = FoundRecord.objects.get(pk=r.json()["id"])
        self.assertEqual((rec.source, rec.contact_phone), ("police", "01700000003"))
        m = Match.objects.get(case_id=cid, record=rec)
        self.assertGreaterEqual(m.score, 60)
        self.assertIn("marks", m.reasons)
        d = self.f.get("/api/family/summary/").json()
        self.assertEqual(d["alert"]["kind"], "match")
        self.assertEqual(d["alert"]["params"]["pct"], m.score)
        self.assertEqual(d["cases"][0]["best_score"], m.score)
        self.assertEqual(d["matches"][0]["record"]["found_place"], "Mirpur Thana")

    def test_opposite_gender_never_matches(self):
        self.post_case()
        self.post_record(gender="female")
        self.assertEqual(Match.objects.count(), 0)

    def test_id_number_match_is_strong(self):
        self.post_case(id_type="nid", id_number="123 456 7890", marks="[]", clothing="[]", traits="{}")
        self.post_record(id_type="nid", id_number="1234567890", marks="[]", clothing="[]", traits="{}", age_min="", age_max="")
        self.assertEqual(Match.objects.get().score, 97)

    def test_family_match_detail_logs_visit_and_shares_photo(self):
        self.post_case()
        rec_id = self.post_record().json()["id"]
        m = Match.objects.get()
        d = self.f.get(f"/api/family/matches/{m.id}/").json()
        self.assertEqual(d["record"]["contact_phone"], "01700000003")
        self.assertNotIn("id_number", d["record"])
        self.assertTrue(AuditLog.objects.filter(action="view", target_type="record", target_id=rec_id, actor=self.fam).exists())
        photo = RecordPhoto.objects.get(record_id=rec_id)
        self.assertEqual(self.f.get(f"/api/photos/record/{photo.id}/").status_code, 200)
        self.assertEqual(client_for(self.other_fam).get(f"/api/photos/record/{photo.id}/").status_code, 404)
        self.assertEqual(self.p.get(f"/api/reporter/records/{rec_id}/").json()["family_views"], 1)

    def test_deceased_record_is_restricted(self):
        cid = self.post_case().json()["id"]
        rec_id = self.post_record(client=self.m, condition="deceased", found_place="Morgue X").json()["id"]
        m = Match.objects.get(case_id=cid)
        d = self.f.get("/api/family/summary/").json()
        self.assertEqual(d["matches"], [])  # not shown before an officer confirms
        self.assertIsNone(d["alert"])
        self.assertIsNone(d["cases"][0]["best_score"])
        self.assertEqual(self.f.get(f"/api/family/matches/{m.id}/").status_code, 404)
        photo = RecordPhoto.objects.get(record_id=rec_id)
        self.assertEqual(self.f.get(f"/api/photos/record/{photo.id}/").status_code, 404)
        # officer confirms: the family is told an officer will contact them, nothing more
        self.assertEqual(self.o.post(f"/api/officer/matches/{m.id}/", {"decision": "confirm"}, format="json").status_code, 200)
        d = self.f.get("/api/family/summary/").json()
        self.assertEqual(d["alert"]["kind"], "officer")
        self.assertNotIn("pct", d["alert"]["params"])
        row = d["matches"][0]
        self.assertEqual((row["score"], row["band"], row["record"]), (None, "restricted", None))
        self.assertNotIn("Morgue", self.f.get("/api/family/summary/").content.decode())
        self.assertNotIn("Morgue", self.f.get("/api/notifications/").content.decode())
        self.assertEqual(self.f.get(f"/api/photos/record/{photo.id}/").status_code, 404)

    def test_officer_rejects_and_family_no_longer_sees_it(self):
        self.post_case()
        self.post_record()
        m = Match.objects.get()
        self.o.post(f"/api/officer/matches/{m.id}/", {"decision": "reject", "note": "different face"}, format="json")
        self.assertEqual(self.f.get("/api/family/summary/").json()["matches"], [])

    def test_officer_queue_detail_and_reunite_deletes_everything(self):
        cid = self.post_case().json()["id"]
        rec_id = self.post_record().json()["id"]
        m = Match.objects.get()
        q = self.o.get("/api/officer/queue/").json()
        self.assertEqual(q["items"][0]["id"], m.id)
        d = self.o.get(f"/api/officer/matches/{m.id}/").json()
        self.assertEqual(d["case"]["owner"]["phone"], "01711111111")
        self.assertEqual(self.o.post(f"/api/officer/matches/{m.id}/reunite/").status_code, 404)  # must confirm first
        self.o.post(f"/api/officer/matches/{m.id}/", {"decision": "confirm"}, format="json")
        self.assertEqual(Notification.objects.filter(user=self.fam, kind="verified").count(), 1)
        self.assertEqual(self.o.post(f"/api/officer/matches/{m.id}/reunite/").status_code, 204)
        self.assertFalse(MissingCase.objects.filter(pk=cid).exists())
        self.assertFalse(FoundRecord.objects.filter(pk=rec_id).exists())
        self.assertEqual(CasePhoto.objects.count() + RecordPhoto.objects.count(), 0)
        self.assertEqual(Notification.objects.filter(user=self.fam, kind="reunited").count(), 1)
        self.assertEqual(Notification.objects.filter(user=self.police, kind="reunited").count(), 1)
        self.assertTrue(AuditLog.objects.filter(action="reunite").exists())

    def test_family_and_reporter_cannot_use_officer_api(self):
        for c in (self.f, self.p):
            self.assertEqual(c.get("/api/officer/queue/").status_code, 403)

    def test_reporter_edits_and_closes_record(self):
        rec_id = self.post_record().json()["id"]
        r = self.p.patch(f"/api/reporter/records/{rec_id}/", {"found_place": "DMCH", "age_min": 70, "age_max": 60}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.p.patch(f"/api/reporter/records/{rec_id}/", {"found_place": "DMCH"}, format="json")
        self.assertEqual(r.json()["found_place"], "DMCH")
        self.assertEqual(self.m.get(f"/api/reporter/records/{rec_id}/").status_code, 404)  # not theirs
        path = RecordPhoto.objects.get(record_id=rec_id).image.path
        self.assertEqual(self.p.delete(f"/api/reporter/records/{rec_id}/").status_code, 204)
        self.assertFalse(os.path.exists(path))

    def test_record_needs_photo_and_valid_phone(self):
        self.assertEqual(self.post_record(photos=[]).status_code, 400)
        self.assertEqual(self.post_record(contact_phone="123").status_code, 400)
        self.assertEqual(self.post_record(condition="sleepy").status_code, 400)


class Marks3DTests(Base):
    def test_point_on_figure_is_stored_and_validated(self):
        mark = [{"region": "face", "part": "left_cheek", "type": "mole", "pos": [0.0661234, 1.63, 0.09]}]
        r = self.post_case(marks=json.dumps(mark))
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(MissingCase.objects.get().marks[0]["pos"], [0.066, 1.63, 0.09])
        for bad in ([0, 9, 0], [0, 1], "x", [True, 1, 0]):
            m = [{**mark[0], "pos": bad}]
            self.assertEqual(self.post_case(marks=json.dumps(m)).status_code, 400, bad)

    def test_close_points_match_even_with_different_part_names(self):
        from .matching import marks_similarity
        a = [{"region": "left_arm", "part": "elbow", "type": "scar", "pos": [0.33, 1.1, 0.02]}]
        b = [{"region": "left_arm", "part": "forearm", "type": "scar", "pos": [0.335, 1.07, 0.02]}]
        far = [{"region": "left_arm", "part": "elbow", "type": "scar", "pos": [0.3, 1.45, 0.0]}]
        self.assertEqual(marks_similarity(a, b), 1.0)
        self.assertLess(marks_similarity(a, far), 1.0)


class MergeTests(Base):
    def test_police_and_hospital_duplicates_merge_with_both_permissions(self):
        cid = self.post_case().json()["id"]
        a = self.post_record().json()["id"]
        b = self.post_record(client=self.m, found_place="DMCH", contact_phone="01744444444",
                             found_at=(timezone.now() - timedelta(hours=1)).isoformat(),
                             medical_notes="stable", photos=[img("m.png")]).json()["id"]
        mr = MergeRequest.objects.get()
        self.assertEqual((mr.a_id, mr.b_id), (a, b))
        self.assertEqual(Notification.objects.filter(kind="merge").count(), 2)
        s = self.p.get("/api/reporter/summary/").json()
        self.assertEqual(s["merges"][0]["other"]["found_place"], "DMCH")
        # each side can see the other side's photo while deciding
        other_photo = RecordPhoto.objects.get(record_id=b)
        self.assertEqual(self.p.get(f"/api/photos/record/{other_photo.id}/").status_code, 200)

        self.assertEqual(self.p.post(f"/api/reporter/merges/{mr.id}/", {"approve": True}, format="json").json()["status"], "pending")
        self.assertEqual(self.m.post(f"/api/reporter/merges/{mr.id}/", {"approve": True}, format="json").json()["status"], "merged")
        kept, gone = FoundRecord.objects.get(pk=a), FoundRecord.objects.get(pk=b)
        self.assertFalse(gone.is_active)
        self.assertEqual(kept.found_place, "DMCH")  # the newer record says where the person is now
        self.assertEqual(kept.medical_notes, "stable")
        self.assertEqual(kept.photos.count(), 2)
        self.assertEqual(Match.objects.filter(case_id=cid).count(), 1)
        self.assertEqual(Match.objects.get().record_id, a)
        # both reporters see the merged record
        self.assertEqual(self.m.get(f"/api/reporter/records/{a}/").status_code, 200)
        self.assertEqual(len(self.m.get("/api/reporter/records/").json()), 1)

    def test_one_side_can_decline(self):
        self.post_record()
        self.post_record(client=self.m, contact_phone="01744444444", photos=[img("m.png")])
        mr = MergeRequest.objects.get()
        self.m.post(f"/api/reporter/merges/{mr.id}/", {"approve": False}, format="json")
        mr.refresh_from_db()
        self.assertEqual(mr.status, "declined")
        self.assertEqual(FoundRecord.objects.filter(is_active=True).count(), 2)

    def test_outsider_cannot_decide(self):
        self.post_record()
        self.post_record(client=self.m, contact_phone="01744444444", photos=[img("m.png")])
        mr = MergeRequest.objects.get()
        other_police = client_for(make_user("01788888888", "police"))
        self.assertEqual(other_police.post(f"/api/reporter/merges/{mr.id}/", {"approve": True}, format="json").status_code, 404)


class NotificationTests(Base):
    def test_mark_read_only_touches_own(self):
        n1 = Notification.objects.create(user=self.fam, kind="system")
        n2 = Notification.objects.create(user=self.other_fam, kind="system")
        r = self.f.post("/api/notifications/read/", {"ids": [n1.id, n2.id]}, format="json")
        self.assertEqual(r.json(), {"updated": 1})
        n2.refresh_from_db()
        self.assertFalse(n2.is_read)

    def test_mark_all_read(self):
        Notification.objects.create(user=self.fam, kind="system")
        Notification.objects.create(user=self.fam, kind="system")
        self.assertEqual(self.f.post("/api/notifications/read/", {}, format="json").json(), {"updated": 2})
        self.assertEqual(self.f.get("/api/notifications/").json()["unread"], 0)


class AdminAuditTests(Base):
    @override_settings(DEBUG=True, SMS_BACKEND="console")
    def test_admin_approves_staff_request(self):
        code = APIClient().post("/api/auth/otp/send/", {"phone": "01799999999", "purpose": "signup"}, format="json").json()["dev_code"]
        r = APIClient().post("/api/auth/register-staff/", {
            "full_name": "SI Rana", "phone": "01799999999", "role": "police", "organization": "Uttara Thana",
            "designation": "SI", "staff_id": "BP-1", "division": "dhaka", "password": "Tiger-Lake-77", "consent": True,
            "otp": code}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        login = lambda: APIClient().post("/api/auth/login/", {"identifier": "01799999999", "password": "Tiger-Lake-77"}, format="json")
        self.assertEqual(login().json()["code"], "pending")
        a = client_for(self.admin)
        pending = a.get("/api/admin/summary/").json()["pending"]
        self.assertEqual([u["phone"] for u in pending], ["01799999999"])
        self.assertEqual(a.patch(f"/api/admin/users/{pending[0]['id']}/", {"action": "approve"}, format="json").status_code, 200)
        self.assertEqual(login().status_code, 200)
        self.assertEqual(client_for(self.officer).get("/api/admin/summary/").status_code, 403)

    def test_admin_rejects_request_and_creates_officer(self):
        u = User.objects.create_user(username="01790000000", phone="01790000000", password=PW, role="medical", is_active=False)
        a = client_for(self.admin)
        self.assertEqual(a.delete(f"/api/admin/users/{u.id}/").status_code, 204)
        self.assertEqual(a.delete(f"/api/admin/users/{self.police.id}/").status_code, 404)  # approved users are not "rejected"
        r = a.post("/api/admin/users/", {"full_name": "New Officer", "phone": "01791111111", "role": "officer",
                                         "password": "Tiger-Lake-77"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)

    def test_auditor_reads_ledger_but_not_photos(self):
        self.post_case()
        d = client_for(self.auditor).get("/api/audit/?action=create_case").json()
        self.assertEqual(d["total"], 1)
        self.assertEqual(d["items"][0]["target_type"], "case")
        self.assertEqual(self.f.get("/api/audit/").status_code, 403)
        photo = CasePhoto.objects.first()
        self.assertEqual(client_for(self.auditor).get(f"/api/photos/case/{photo.id}/").status_code, 404)

    def test_audit_rows_cannot_be_edited(self):
        row = AuditLog.objects.create(action="x")
        row.action = "y"
        with self.assertRaises(RuntimeError):
            row.save()


class ThresholdTests(Base):
    def test_matches_at_50_or_below_are_dropped(self):
        from . import matching
        self.post_case()
        rec = FoundRecord.objects.get(pk=self.post_record().json()["id"])
        m = Match.objects.get()
        self.assertGreater(m.score, 50)
        # pretend the engine now scores this pair 50%: the match disappears for everyone
        orig = matching.score
        matching.score = lambda c, r: (50, ["gender"])
        try:
            matching.run_for_record(rec)
        finally:
            matching.score = orig
        self.assertEqual(Match.objects.count(), 0)
        self.assertEqual(self.f.get("/api/family/summary/").json()["matches"], [])
        self.assertEqual(self.o.get("/api/officer/queue/").json()["items"], [])


@override_settings(DEBUG=True, SMS_BACKEND="console")
class SignupWithReportTests(Base):
    def body(self, code, **extra):
        d = {**self.case_body(), "full_name": "Nila Akter", "phone": "01712345678", "email": "", "age": "34",
             "password": "Tiger-Lake-77", "consent": "true", "otp": code}
        d.update(extra)
        return d

    def code(self, phone="01712345678"):
        return APIClient().post("/api/auth/otp/send/", {"phone": phone, "purpose": "signup"}, format="json").json()["dev_code"]

    def test_report_then_account_in_one_go(self):
        self.post_record()  # a police record already waiting
        r = APIClient().post("/api/auth/register-report/", self.body(self.code()), format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        d = r.json()
        user = User.objects.get(phone="01712345678")
        self.assertEqual((user.role, user.relationship, user.first_name), ("family", "parent", "Nila Akter"))
        case = MissingCase.objects.get(pk=d["case_id"])
        self.assertEqual((case.owner, case.photos.count()), (user, 3))
        self.assertIn("access", d)
        self.assertEqual(Notification.objects.filter(user=user, kind="match").count(), 1)  # told about the match at once
        me = APIClient()
        me.credentials(HTTP_AUTHORIZATION=f"Bearer {d['access']}")
        self.assertEqual(me.get("/api/family/summary/").json()["stats"]["cases"], 1)

    def test_mistake_in_report_keeps_the_code_usable(self):
        code = self.code()
        r = APIClient().post("/api/auth/register-report/", self.body(code, photos=[img()]), format="multipart")
        self.assertEqual(r.status_code, 400)
        self.assertIn("photos", r.json())
        self.assertEqual(User.objects.filter(phone="01712345678").count(), 0)
        r = APIClient().post("/api/auth/register-report/", self.body(code), format="multipart")
        self.assertEqual(r.status_code, 201, r.content)

    def test_wrong_code_or_minor_creates_nothing(self):
        code = self.code()
        bad = APIClient().post("/api/auth/register-report/", self.body("000000" if code != "000000" else "111111"), format="multipart")
        self.assertEqual(bad.json()["otp"], ["otp_wrong"])
        minor = APIClient().post("/api/auth/register-report/", self.body(code, age="16"), format="multipart")
        self.assertIn("age", minor.json())
        self.assertEqual((User.objects.filter(phone="01712345678").count(), MissingCase.objects.count()), (0, 0))


class ReportSearchTests(Base):
    def setUp(self):
        super().setUp()
        self.post_case(person_name="Rahim Uddin", last_seen_at="2026-11-01T10:00:00Z")
        self.post_case(client=client_for(self.other_fam), person_name="Shila Akter", gender="female", person_age=14,
                       division="khulna", marks=json.dumps([{"region": "face", "part": "chin", "type": "mole"}]))

    def names(self, client, query=""):
        return sorted(c["person_name"] for c in client.get(f"/api/reports/?{query}").json()["items"])

    def test_police_can_search_and_filter_every_report(self):
        self.assertEqual(self.names(self.p), ["Rahim Uddin", "Shila Akter"])
        self.assertEqual(self.names(self.p, "q=shila"), ["Shila Akter"])
        self.assertEqual(self.names(self.p, "gender=male"), ["Rahim Uddin"])
        self.assertEqual(self.names(self.p, "division=khulna&age_max=18"), ["Shila Akter"])
        self.assertEqual(self.names(self.p, "mark_type=mole&mark_region=face"), ["Shila Akter"])
        self.assertEqual(self.names(self.p, "mark_type=scar"), ["Rahim Uddin"])
        self.assertEqual(self.names(self.p, "seen_from=2026-10-30&seen_to=2026-11-02"), ["Rahim Uddin"])
        cid = MissingCase.objects.get(person_name="Shila Akter").id
        d = self.p.get(f"/api/reports/{cid}/").json()
        self.assertEqual(d["owner"]["phone"], "01722222222")
        photo = CasePhoto.objects.filter(case_id=cid).first()
        self.assertEqual(self.p.get(f"/api/photos/case/{photo.id}/").status_code, 200)
        # the family sees that an official looked at the post
        self.assertEqual(client_for(self.other_fam).get(f"/api/family/cases/{cid}/").json()["official_views"], 1)

    def test_families_and_medical_cannot_browse(self):
        for c in (self.f, self.m):
            self.assertEqual(c.get("/api/reports/").status_code, 403)
        cid = MissingCase.objects.get(person_name="Shila Akter").id
        photo = CasePhoto.objects.filter(case_id=cid).first()
        self.assertEqual(self.m.get(f"/api/photos/case/{photo.id}/").status_code, 404)
