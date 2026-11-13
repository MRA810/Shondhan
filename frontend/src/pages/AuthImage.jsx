import { useEffect, useState } from "react";
import { getPhoto } from "../api.js";

// A private picture: loaded with the login token, shown as a small square.
export default function AuthImage({ caseId, photoId, alt }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let url, dead = false;
    getPhoto(caseId, photoId)
      .then((u) => { if (dead) URL.revokeObjectURL(u); else { url = u; setSrc(u); } })
      .catch(() => {});
    return () => { dead = true; if (url) URL.revokeObjectURL(url); };
  }, [caseId, photoId]);
  return src ? <img className="thumb" src={src} alt={alt} /> : <div className="thumb" aria-hidden="true" />;
}
