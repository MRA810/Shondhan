"""
Sending SMS. Pick the provider in backend/.env:

    SMS_BACKEND=console      development: the code is printed in the Django log (default)
    SMS_BACKEND=bulksmsbd    bulksmsbd.net      needs SMS_API_KEY and SMS_SENDER_ID
    SMS_BACKEND=smsnetbd     sms.net.bd (Alpha) needs SMS_API_KEY (SMS_SENDER_ID optional)
"""
import json
import logging
import urllib.parse
import urllib.request

from django.conf import settings

log = logging.getLogger("shondhan.sms")


class SMSError(Exception):
    pass


def _intl(phone):
    """01XXXXXXXXX -> 8801XXXXXXXXX"""
    return "88" + phone if phone.startswith("01") else phone


def _post(url, data):
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=body, method="POST",
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            text = r.read().decode("utf-8", "replace")
    except Exception as e:  # network problems, provider down
        raise SMSError(str(e)) from e
    try:
        return json.loads(text)
    except ValueError:
        return {"raw": text}


def send_sms(phone, message):
    backend = getattr(settings, "SMS_BACKEND", "console")
    key, sender = getattr(settings, "SMS_API_KEY", ""), getattr(settings, "SMS_SENDER_ID", "")
    if backend == "console":
        print(f"\n[SMS to {phone}] {message}\n", flush=True)
        log.warning("SMS (console backend) to %s: %s", phone, message)
        return
    if backend == "bulksmsbd":
        res = _post("http://bulksmsbd.net/api/smsapi",
                    {"api_key": key, "senderid": sender, "type": "text", "number": _intl(phone), "message": message})
        # bulksmsbd answers {"response_code": 202, ...} on success
        if str(res.get("response_code", "")) != "202":
            raise SMSError(f"bulksmsbd: {res}")
        return
    if backend == "smsnetbd":
        data = {"api_key": key, "msg": message, "to": _intl(phone)}
        if sender:
            data["sender_id"] = sender
        res = _post("https://api.sms.net.bd/sendsms", data)
        if str(res.get("error", "")) != "0":
            raise SMSError(f"sms.net.bd: {res}")
        return
    raise SMSError(f"Unknown SMS_BACKEND '{backend}'")
