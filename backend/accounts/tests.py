from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient, APITestCase

from .models import PhoneOTP

User = get_user_model()

SIGNUP = {"full_name": "Nila Akter", "phone": "০১৭১২৩৪৫৬৭৮", "email": "nila@example.com", "age": 30,
          "relationship": "parent", "password": "Tiger-Lake-77", "consent": True}


def send_code(client, phone, purpose="signup"):
    r = client.post("/api/auth/otp/send/", {"phone": phone, "purpose": purpose}, format="json")
    return r, r.json().get("dev_code")


@override_settings(DEBUG=True, SMS_BACKEND="console")  # codes come back in the response (development mode)
class AuthTests(APITestCase):
    def setUp(self):
        cache.clear()  # login/register throttles

    def register(self, **kw):
        body = {**SIGNUP, **kw}
        if "otp" not in kw:
            PhoneOTP.objects.all().delete()  # skip the 1-minute wait between codes in tests
            body["otp"] = send_code(self.client, body["phone"])[1] or "000000"
        return self.client.post("/api/auth/register/", body, format="json")

    def login(self, ident="01712345678", pw="Tiger-Lake-77"):
        return self.client.post("/api/auth/login/", {"identifier": ident, "password": pw}, format="json")

    def test_register_then_login_by_phone_or_email(self):
        self.assertEqual(self.register().status_code, 201)
        u = User.objects.get()
        self.assertEqual((u.phone, u.role, u.consent_version), ("01712345678", "family", "v1"))
        self.assertEqual(u.notifications.filter(kind="system").count(), 1)
        r = self.login()
        self.assertEqual(r.status_code, 200)
        self.assertIn("refresh", r.json())
        self.assertEqual(self.login("NILA@example.com").status_code, 200)

    def test_register_rules(self):
        for bad in ({"age": 17}, {"phone": "123"}, {"consent": False}, {"password": "password"}, {"relationship": "boss"}):
            self.assertEqual(self.register(**bad).status_code, 400, bad)
        self.register()
        self.assertEqual(self.register().json()["phone"], ["exists"])

    def test_cannot_pick_staff_role_on_family_signup(self):
        self.register(role="admin")
        self.assertEqual(User.objects.get().role, "family")

    def test_lockout_after_five_wrong_passwords(self):
        self.register()
        for _ in range(5):
            self.assertEqual(self.login(pw="wrong").json()["code"], "invalid")
        self.assertEqual(self.login().json()["code"], "locked")

    def test_unknown_user_and_wrong_password_look_the_same(self):
        self.register()
        self.assertEqual(self.login("01999999999").json(), self.login(pw="nope").json())

    def test_refresh(self):
        self.register()
        r = self.client.post("/api/auth/refresh/", {"refresh": self.login().json()["refresh"]}, format="json")
        self.assertIn("access", r.json())


class ProfileTests(APITestCase):
    def setUp(self):
        self.me = User.objects.create_user(username="01711111111", phone="01711111111", password="x", role="family", age=30)
        User.objects.create_user(username="01722222222", phone="01722222222", password="x", email="taken@x.com")
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
        self.me.email = "me@x.com"
        self.me.save()
        self.assertEqual(self.client.patch("/api/auth/me/", {"email": "ME@x.com"}, format="json").status_code, 200)


@override_settings(DEBUG=True, SMS_BACKEND="console")
class OTPTests(APITestCase):
    def setUp(self):
        cache.clear()

    def test_code_is_needed_and_single_use(self):
        r, code = send_code(self.client, "01712345678")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(code), 6)
        self.assertNotEqual(PhoneOTP.objects.get().code_hash, code)  # only a hash is stored
        bad = self.client.post("/api/auth/register/", {**SIGNUP, "otp": "111111" if code != "111111" else "222222"}, format="json")
        self.assertEqual(bad.json()["otp"], ["otp_wrong"])
        self.assertEqual(self.client.post("/api/auth/register/", {**SIGNUP, "otp": code}, format="json").status_code, 201)
        User.objects.all().delete()
        self.assertEqual(self.client.post("/api/auth/register/", {**SIGNUP, "otp": code}, format="json").json()["otp"], ["otp_expired"])

    def test_wait_between_codes_tries_and_expiry(self):
        send_code(self.client, "01712345678")
        r = self.client.post("/api/auth/otp/send/", {"phone": "01712345678", "purpose": "signup"}, format="json")
        self.assertEqual((r.status_code, r.json()["code"]), (429, "otp_wait"))
        for _ in range(PhoneOTP.MAX_TRIES):
            self.client.post("/api/auth/register/", {**SIGNUP, "otp": "999999x"}, format="json")
        self.assertEqual(self.client.post("/api/auth/register/", {**SIGNUP, "otp": "1"}, format="json").json()["otp"], ["otp_tries"])
        PhoneOTP.objects.update(attempts=0, created_at=PhoneOTP.objects.get().created_at - timedelta(minutes=6))
        self.assertEqual(self.client.post("/api/auth/register/", {**SIGNUP, "otp": "1"}, format="json").json()["otp"], ["otp_expired"])

    def test_signup_code_refused_for_existing_number(self):
        User.objects.create_user(username="01712345678", phone="01712345678", password="x")
        r, _ = send_code(self.client, "০১৭১২৩৪৫৬৭৮")
        self.assertEqual(r.json()["phone"], ["exists"])

    @override_settings(DEBUG=False)
    def test_code_never_returned_outside_development(self):
        r, code = send_code(self.client, "01712345678")
        self.assertEqual((r.status_code, code), (200, None))

    def test_forgot_password(self):
        u = User.objects.create_user(username="01712345678", phone="01712345678", password="Old-Pass-123", role="family")
        u.failed_attempts = 4
        u.save()
        r, code = send_code(self.client, "01712345678", "reset")
        self.assertEqual(r.status_code, 200)
        weak = self.client.post("/api/auth/password/reset/", {"phone": "01712345678", "otp": code, "password": "123"}, format="json")
        self.assertEqual(weak.json()["password"], ["weak"])
        ok = self.client.post("/api/auth/password/reset/", {"phone": "01712345678", "otp": code, "password": "New-Lake-456"}, format="json")
        self.assertEqual(ok.status_code, 200)
        login = self.client.post("/api/auth/login/", {"identifier": "01712345678", "password": "New-Lake-456"}, format="json")
        self.assertEqual(login.status_code, 200)
        # unknown numbers get the same answer and no code
        r, code = send_code(self.client, "01999999999", "reset")
        self.assertEqual((r.status_code, code, PhoneOTP.objects.filter(phone="01999999999").count()), (200, None, 0))
