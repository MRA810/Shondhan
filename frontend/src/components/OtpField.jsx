import { useEffect, useState } from "react";
import { sendOtp } from "../api.js";
import { normDigits, validPhone } from "../hooks.js";
import { usePrefs } from "../prefs.jsx";

// "Send code" button + 6-digit code box. onExists() is called when the number already has an account (signup).
export default function OtpField({ phone, purpose = "signup", value, onChange, error, onExists }) {
  const { t, num } = usePrefs();
  const [sent, setSent] = useState(false);
  const [wait, setWait] = useState(0);
  const [msg, setMsg] = useState("");
  const [dev, setDev] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (wait <= 0) return undefined;
    const id = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const clean = normDigits(phone).replace(/[\s-]/g, "");
  const send = async () => {
    if (!validPhone(clean)) return setMsg("e_phone");
    setBusy(true); setMsg("");
    try {
      const d = await sendOtp(clean, purpose);
      setSent(true); setWait(60); setDev(d.dev_code || "");
    } catch (x) {
      if (x.code === "otp_wait") { setWait(x.wait); setMsg(x.wait > 300 ? "otp_hour" : ""); setSent(true); }
      else if (x.code === "validation" && x.fields?.phone?.[0] === "exists") { setMsg("phoneExists"); onExists?.(); }
      else setMsg(x.code === "sms_failed" ? "sms_failed" : "network");
    } finally { setBusy(false); }
  };

  return (
    <div className="otp">
      <p className="hint">{t("otp_help", { phone: clean })}</p>
      <button type="button" className="ghost" onClick={send} disabled={busy || wait > 0}>
        {busy ? t("loading") : wait > 0 ? t("otp_resendIn", { n: wait }) : sent ? t("otp_resend") : t("otp_send")}
      </button>
      {sent && <p className="success" role="status">{t("otp_sent", { phone: num(clean) })}</p>}
      {dev && <p className="warn devcode">{t("otp_dev", { code: dev })}</p>}
      {msg && <p className="fielderr" role="alert">{t(msg, { n: Math.ceil(wait / 60) })}</p>}
      <label htmlFor="otp">{t("otp_label")}</label>
      <input id="otp" className="otpinput" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={value}
        onChange={(e) => onChange(normDigits(e.target.value).replace(/\D/g, "").slice(0, 6))}
        aria-invalid={!!error} aria-describedby={error ? "otp-err" : undefined} />
      {error && <p className="fielderr" id="otp-err" role="alert">{t(error)}</p>}
    </div>
  );
}
