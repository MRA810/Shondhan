import { Suspense, useEffect, useRef, useState } from "react";
import { usePrefs } from "../prefs.jsx";
import { BODY, CLOTHING_ITEMS, COLORS, MARK_TYPES, TRAITS } from "../traits.js";
import { PIN_COLORS, hasWebGL, partCenter } from "../body/bodyMap.js";
import { BodyModel, marksToPins } from "../body/MarksFigure.jsx";
import { Loading } from "./ui.jsx";

export function Select({ id, value, onChange, options, label, prefix, blank = "choose", required, error }) {
  const { t } = usePrefs();
  return (
    <>
      {label && <label htmlFor={id}>{label}</label>}
      <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)} required={required}
        aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined}>
        {blank && <option value="">{t(blank)}</option>}
        {options.map((o) => <option key={o} value={o}>{t(`${prefix}${o}`)}</option>)}
      </select>
      {error && <p className="fielderr" id={`${id}-err`}>{t(error)}</p>}
    </>
  );
}

export function Field({ id, label, error, hint, children }) {
  const { t } = usePrefs();
  return (
    <>
      <label htmlFor={id}>{label}</label>
      {hint && <p className="hint" id={`${id}-hint`}>{hint}</p>}
      {children}
      {error && <p className="fielderr" id={`${id}-err`} role="alert">{t(error)}</p>}
    </>
  );
}

// skin / build / hair dropdowns
export function TraitsPicker({ value, onChange }) {
  const { t } = usePrefs();
  return (
    <div className="grid2">
      {Object.entries(TRAITS).map(([k, opts]) => (
        <div key={k}>
          <Select id={`tr-${k}`} label={t(`tr_${k}`)} value={value[k]} options={opts} prefix={`tv_${k}_`} blank="notSure"
            onChange={(v) => onChange({ ...value, [k]: v })} />
        </div>
      ))}
    </div>
  );
}

// clothing: item + colour rows
export function ClothingEditor({ value, onChange, onPending }) {
  const { t } = usePrefs();
  const [item, setItem] = useState("");
  const [color, setColor] = useState("");
  useEffect(() => { onPending?.(!!item); }, [item]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = () => {
    if (!item) return;
    onChange([...value, { item, color }]);
    setItem(""); setColor("");
  };
  return (
    <div className="editor">
      {value.length > 0 && (
        <ul className="chips">
          {value.map((c, i) => (
            <li key={i} className="pill">
              {[c.color && t(`color_${c.color}`), t(`cloth_${c.item}`)].filter(Boolean).join(" ")}
              <button type="button" className="x" aria-label={t("remove")} onClick={() => onChange(value.filter((_, j) => j !== i))}>×</button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid3">
        <div><Select id="cl-item" label={t("clothItem")} value={item} onChange={setItem} options={CLOTHING_ITEMS} prefix="cloth_" /></div>
        <div><Select id="cl-color" label={t("clothColor")} value={color} onChange={setColor} options={COLORS} prefix="color_" blank="notSure" /></div>
        <div className="addcell"><button type="button" className={item ? "primary inline" : "ghost"} onClick={add} disabled={!item || value.length >= 10}>+ {t("add")}</button></div>
      </div>
    </div>
  );
}

// Body marks, in three plain steps shown on screen:
//   1. tap the exact place on the 3D figure (or pick it from the list, which also pins it)
//   2. optionally describe it        3. tap the type of mark: that SAVES the mark at once.
// There is no separate "Add" button to forget. onPending(true) while a place is chosen but not saved yet,
// so the page can stop the person from leaving with an unfinished mark.
export function MarksEditor({ value, onChange, medical, onPending }) {
  const { t, num } = usePrefs();
  const empty = { region: "", part: "", detail: "", pos: null };
  const [m, setM] = useState(empty);
  const [justAdded, setJustAdded] = useState(0);
  const [webgl] = useState(hasWebGL);
  const types = medical ? MARK_TYPES : MARK_TYPES.filter((x) => !["wound", "fracture"].includes(x));
  const pending = !!m.region;
  useEffect(() => { onPending?.(pending); }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (type) => {
    if (!m.region || value.length >= 15) return;
    onChange([...value, { ...m, type, pos: m.pos || null }]);
    setJustAdded(value.length + 1);
    setM(empty);
  };
  const fromList = (region, part) => setM({ ...m, region, part, pos: region && webgl ? partCenter(region, part) : null });
  const pins = [...marksToPins(t, value), ...(m.pos ? [{ pos: m.pos, color: PIN_COLORS.draft, big: true, label: t("b3_newPin") }] : [])];
  const place = m.region && [t(`body_${m.region}`), m.part ? t(`part_${m.part}`) : ""].filter(Boolean).join(", ");
  return (
    <div className="editor markeditor">
      {value.length > 0 && (
        <>
          <h3 className="savedtitle">{t("mk_saved", { n: value.length })}</h3>
          <ol className="chips numbered">
            {value.map((x, i) => (
              <li key={i} className={`pill ${justAdded === i + 1 ? "flash" : ""}`}>
                <b>{num(i + 1)}.</b> {t(`mark_${x.type}`)}: {t(`body_${x.region}`)}{x.part ? `, ${t(`part_${x.part}`)}` : ""}{x.detail ? ` (${x.detail})` : ""}
                <button type="button" className="x" aria-label={`${t("remove")} ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>×</button>
              </li>
            ))}
          </ol>
          {justAdded > 0 && !pending && <p className="success" role="status">{t("mk_added", { n: justAdded })}</p>}
        </>
      )}

      <ol className="mksteps">
        <li className={pending ? "done" : "now"}>
          <span className="mkno">{num(1)}</span>
          <div className="grow">
            <strong>{t(webgl ? "mk_s1" : "mk_s1list")}</strong>
            {webgl ? (
              <>
                <p className="hint">{t("b3_help")}</p>
                <Suspense fallback={<div className="body3d-stage loadingbox"><Loading /></div>}>
                  <BodyModel interactive pins={pins} onPick={({ region, part, pos }) => setM({ ...m, region, part, pos })} />
                </Suspense>
                <details className="listpick">
                  <summary>{t("b3_orList")}</summary>
                  <PlaceSelects m={m} onPick={fromList} />
                </details>
              </>
            ) : (
              <>
                <p className="warn">{t("b3_noWebgl")}</p>
                <PlaceSelects m={m} onPick={fromList} />
              </>
            )}
            <p className={`picked ${pending ? "on" : ""}`} aria-live="polite">{pending ? t("b3_selected", { place }) : t("b3_pick")}</p>
          </div>
        </li>
        <li className={pending ? "now" : "later"}>
          <span className="mkno">{num(2)}</span>
          <div className="grow">
            <label htmlFor="mk-detail"><strong>{t("mk_s2")}</strong></label>
            <input id="mk-detail" maxLength={120} value={m.detail} placeholder={t("mkDetailPh")} disabled={!pending}
              onChange={(e) => setM({ ...m, detail: e.target.value })} />
          </div>
        </li>
        <li className={pending ? "now" : "later"}>
          <span className="mkno">{num(3)}</span>
          <div className="grow">
            <strong id="mk-type-label">{t("mk_s3")}</strong>
            <div className="typechips" role="group" aria-labelledby="mk-type-label">
              {types.map((ty) => (
                <button key={ty} type="button" className="ghost typechip" disabled={!pending} onClick={() => save(ty)}>{t(`mark_${ty}`)}</button>
              ))}
            </div>
            {pending && <button type="button" className="link linkbtn" onClick={() => setM(empty)}>{t("mk_cancel")}</button>}
          </div>
        </li>
      </ol>
    </div>
  );
}

function PlaceSelects({ m, onPick }) {
  const { t } = usePrefs();
  return (
    <div className="grid2">
      <div><Select id="mk-region" label={t("mkRegion")} value={m.region} options={Object.keys(BODY)} prefix="body_" onChange={(r) => onPick(r, "")} /></div>
      <div><Select id="mk-part" label={t("mkPart")} value={m.part} options={m.region ? BODY[m.region] : []} prefix="part_"
        blank={m.region ? "wholeArea" : "chooseRegionFirst"} onChange={(p) => onPick(m.region, p)} /></div>
    </div>
  );
}

const MAX_FILE = 5 * 1024 * 1024;

// file picker with previews and remove buttons
export function PhotoPicker({ id, files, onChange, max, onError }) {
  const { t, num } = usePrefs();
  const urls = useRef(new Map());
  const [, force] = useState(0);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  const urlFor = (f) => {
    if (!urls.current.has(f)) urls.current.set(f, URL.createObjectURL(f));
    return urls.current.get(f);
  };
  const pick = (e) => {
    const picked = [...e.target.files];
    e.target.value = "";
    const bad = picked.find((f) => !f.type.startsWith("image/"));
    const big = picked.find((f) => f.size > MAX_FILE);
    if (bad) return onError("e_notImage");
    if (big) return onError("e_big");
    const next = [...files, ...picked].slice(0, max);
    onError("");
    onChange(next);
    force((n) => n + 1);
  };
  return (
    <>
      <label className="ghost filebtn">
        <span>+ {t("c_add")}</span>
        <input id={id} type="file" accept="image/*" multiple onChange={pick} disabled={files.length >= max} />
      </label>
      <span className="muted count"> {t("c_count", { n: files.length })} / {num(max)}</span>
      {files.length > 0 && (
        <ul className="previews">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <img src={urlFor(f)} alt={t("preview", { n: i + 1 })} />
              <button type="button" className="x" aria-label={t("remove")} onClick={() => onChange(files.filter((_, j) => j !== i))}>×</button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
