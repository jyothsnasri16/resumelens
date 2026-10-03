const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const chips = (a, cls = "") => `<div class="chips">${(a || []).map(x => `<span class="chip ${cls}">${esc(x)}</span>`).join("")}</div>`;
const list = a => `<ul>${(a || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
// state.text/state.match always hold whichever resume is "active" for later steps —
// the original until Compare finds an edited version that fits better or newly qualifies.
const state = { text: "", match: null, company: "", role: "", jd: "" };

async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}
async function run(btn, status, label, task) {
  btn.disabled = true; status.className = "status"; status.textContent = label;
  try { await task(); status.textContent = ""; }
  catch (e) { status.className = "status err"; status.textContent = e.message; }
  finally { btn.disabled = false; }
}
function step(n) {
  [1, 2, 3, 4].forEach(i => $("#n" + i).className = i < n ? "done" : i === n ? "active" : "");
}
function unlock(id) { document.querySelector(id).classList.remove("locked"); }
function ring(score, applicable) {
  const C = 2 * Math.PI * 42;
  return `<svg class="ring ${applicable ? "" : "low"}" viewBox="0 0 96 96" role="img" aria-label="Score ${score} out of 100">
    <circle class="bg" cx="48" cy="48" r="42"/>
    <circle class="fg" cx="48" cy="48" r="42" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - score / 100)}"/>
    <text x="48" y="54" text-anchor="middle">${score}%</text></svg>`;
}
function setInterviewUnlock(applicable, source) {
  if (applicable) {
    unlock("#p4"); step(4);
    $("#h4").textContent = `Your ${source} resume matches well. Get ready for ${esc(state.company || "this company")}'s interview rounds.`;
    $("#a4").hidden = false;
  } else {
    $("#p4").classList.add("locked"); $("#a4").hidden = true;
    $("#h4").textContent = "Neither resume clears a 60% fit yet. Close the gaps, then check again — interview prep unlocks at 60 or higher.";
  }
}
const jsonPost = body => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const jobBody = () => ({ resume_text: state.text, jd: state.jd, company: state.company, role: state.role,
  gaps: state.match?.missing_skills || [] });

function wireDrop(dropId, fileId, nameId) {
  const drop = $(dropId);
  $(fileId).onchange = e => { if (e.target.files[0]) $(nameId).textContent = e.target.files[0].name; };
  ["dragover", "dragleave", "drop"].forEach(t => drop.addEventListener(t, e => {
    e.preventDefault(); drop.classList.toggle("over", t === "dragover");
    if (t === "drop" && e.dataTransfer.files[0]) { $(fileId).files = e.dataTransfer.files; $(nameId).textContent = e.dataTransfer.files[0].name; }
  }));
}
wireDrop("#drop", "#file", "#fname");
wireDrop("#dropB", "#fileB", "#fnameB");

$("#b1").onclick = () => run($("#b1"), $("#s1"), "Reading your resume...", async () => {
  const form = new FormData();
  const file = $("#file").files[0];
  if (file) form.append("file", file); else form.append("text", $("#text").value);
  const { resume_text, analysis: a } = await api("/api/resume", { method: "POST", body: form });
  state.text = resume_text;
  $("#r1").innerHTML = `<h3>Summary</h3><p>${esc(a.summary)} <strong>${esc(a.experience_level)}</strong></p>
    <h3>Skills found</h3>${chips(a.skills)}<h3>Strengths</h3>${list(a.strengths)}
    <h3>Weaknesses</h3>${list(a.weaknesses)}<h3>How to improve it</h3>${list(a.improvements)}`;
  unlock("#p2"); step(2);
  $("#p2").scrollIntoView({ behavior: "smooth" });
});

$("#b2").onclick = () => run($("#b2"), $("#s2"), "Comparing your resume with the job...", async () => {
  Object.assign(state, { company: $("#company").value.trim(), role: $("#role").value.trim(), jd: $("#jd").value.trim() });
  const m = state.match = await api("/api/match", jsonPost(jobBody()));
  $("#r2").innerHTML = `<div class="score">${ring(m.score, m.applicable)}
      <div class="verdict ${m.applicable ? "" : "bad"}"><b>${m.applicable ? "Good fit for this job" : "Not a fit yet"}</b>${esc(m.verdict)}</div></div>
    <h3>Skills you have</h3>${chips(m.matched_skills)}<h3>Skills you are missing</h3>${chips(m.missing_skills, "bad")}
    <h3>Other requirements you do not meet</h3>${list(m.missing_requirements)}<h3>Edit your resume</h3>${list(m.resume_fixes)}
    ${m.applicable ? "" : `<h3>Learning roadmap</h3>${list(m.learning_roadmap)}`}`;

  unlock("#p3");
  setInterviewUnlock(m.applicable, "original");
  step(m.applicable ? 4 : 3);
  $("#p3").scrollIntoView({ behavior: "smooth" });
});

$("#b3cmp").onclick = () => run($("#b3cmp"), $("#s3cmp"), "Reading and scoring the edited resume...", async () => {
  const file = $("#fileB").files[0];
  if (!file) throw new Error("Upload the edited resume first.");
  const form = new FormData(); form.append("file", file);
  const { resume_text: textB } = await api("/api/resume", { method: "POST", body: form });
  if (textB.trim() === state.text.trim()) {
    $("#r3cmp").innerHTML = `<p class="hint">This is the same resume as the original — no changes to compare. Upload an edited version to see a difference.</p>`;
    return;
  }
  const b = await api("/api/match", jsonPost({ resume_text: textB, jd: state.jd, company: state.company, role: state.role }));
  const a = state.match;
  const delta = b.score - a.score;
  const snippet = t => esc(t.replace(/\s+/g, " ").trim().slice(0, 70)) + "…";
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const aSet = new Set((a.matched_skills || []).map(norm));
  const bSet = new Set((b.matched_skills || []).map(norm));
  const gained = (b.matched_skills || []).filter(s => !aSet.has(norm(s)));
  const lost = (a.matched_skills || []).filter(s => !bSet.has(norm(s)));
  $("#r3cmp").innerHTML = `<div class="compare-cols">
      <div><h3>Original resume</h3>${ring(a.score, a.applicable)}<p class="snippet">${snippet(state.text)}</p></div>
      <div><h3>Edited resume</h3>${ring(b.score, b.applicable)}<p class="snippet">${snippet(textB)}</p></div>
    </div>
    <p class="verdict ${delta >= 0 ? "" : "bad"}"><b>${delta > 0 ? `Up ${delta} points` : delta < 0 ? `Down ${Math.abs(delta)} points` : "No change"}</b></p>
    ${gained.length ? `<h3>Newly matched skills</h3>${chips(gained)}` : ""}
    ${lost.length ? `<h3>No longer matched</h3>${chips(lost, "bad")}` : ""}`;

  // The edited resume becomes the active one for interview prep whenever it's the better fit —
  // so prep is based on whichever version you'd actually submit.
  if (b.score >= a.score) {
    state.text = textB; state.match = b;
    setInterviewUnlock(b.applicable, "edited");
  } else {
    setInterviewUnlock(a.applicable, "original");
  }
});

$("#b4").onclick = () => run($("#b4"), $("#s4"), "Preparing your interview plan...", async () => {
  const p = await api("/api/prep", jsonPost(jobBody()));
  $("#r4").innerHTML = `${p.note ? `<p class="hint">${esc(p.note)}</p>` : ""}
    <h3>Interview rounds</h3>${list(p.process)}<h3>HR questions</h3>${list(p.hr_questions)}
    <h3>Technical topics to revise</h3>${chips(p.technical_topics)}<h3>Technical round questions</h3>
    ${(p.technical_questions || []).map(q => `<div class="q"><strong>${esc(q.question)}</strong><small>${esc(q.hint)}</small></div>`).join("")}
    <h3>Coding practice</h3>${list(p.coding_practice)}<h3>About the company</h3>${list(p.company_tips)}`;
  $("#realq-wrap").hidden = false;
  $("#realskills-wrap").hidden = false;
});

$("#brq").onclick = () => run($("#brq"), $("#srq"), "Searching Glassdoor, AmbitionBox and similar sites...", async () => {
  const r = await api("/api/real-questions", jsonPost({ company: state.company, role: state.role }));
  if (!r.questions || !r.questions.length) {
    $("#rrq").innerHTML = `<p class="hint">${esc(r.note || "No recent reported questions were found for this search. Try a more common role title.")}</p>`;
    return;
  }
  $("#rrq").innerHTML = (r.questions || []).map(q => `<div class="rq"><div>${esc(q.question)}</div>
    ${q.source_url ? `<a href="${esc(q.source_url)}" target="_blank" rel="noopener">${esc(q.source_url)}</a>` : ""}</div>`).join("");
});

$("#brsk").onclick = () => run($("#brsk"), $("#srsk"), "Searching GeeksforGeeks, Indeed and similar sites...", async () => {
  const r = await api("/api/real-skills", jsonPost({ resume_text: state.text, company: state.company, role: state.role }));
  if (!r.skills || !r.skills.length) {
    $("#rrsk").innerHTML = `<p class="hint">${esc(r.note || "No real requirement listings were found for this search.")}</p>`;
    return;
  }
  $("#rrsk").innerHTML = `<h3>Required skills found online</h3>${chips(r.skills.map(s => s.skill))}
    <h3>Your resume covers</h3>${chips(r.matched)}<h3>Your resume is missing</h3>${chips(r.missing, "bad")}`;
});