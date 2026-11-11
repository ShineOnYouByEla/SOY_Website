/* ============================================================
   Nachbau des GitHub-Teils fuer die Tests
   ------------------------------------------------------------
   Gerade genug der REST- und Git-Data-API, dass app.js darauf
   veroeffentlichen kann — mit echten Branches, damit auffaellt,
   wenn ein Commit auf dem falschen landet oder etwas ueber einen
   neueren Stand geschrieben wird.
   ============================================================ */

/**
 * Wie in kataloge-api.test.mjs, aber jeder Branch hat seinen eigenen Stand:
 * Nur so faellt auf, wenn ein Commit auf dem falschen landet. Nachgebaut sind
 * Referenzen, Blobs, Bäume, Commits und die Merge-API.
 */
export function fakeGitHub(startDateien, { mergeKonflikt = false } = {}) {
  let zaehler = 0;
  const blobs = new Map(); // sha -> Inhalt
  const baeume = new Map(); // sha -> Map(pfad -> blobSha)
  const commits = new Map(); // sha -> baumSha
  const branches = new Map(); // name -> commitSha

  const blobKennungen = new Map();
  const neuerBlob = (inhalt) => {
    if (blobKennungen.has(inhalt)) return blobKennungen.get(inhalt);
    const sha = `blob${++zaehler}`;
    blobs.set(sha, inhalt);
    blobKennungen.set(inhalt, sha);
    return sha;
  };
  /* Wie bei Git haengt die Kennung am Inhalt: derselbe Bestand ergibt
     denselben Baum. Nur so faellt auf, wenn das Backend einen leeren Commit
     anlegt. */
  const baumKennungen = new Map();
  const neuerBaum = (eintraege) => {
    const liste = [...eintraege].sort(([a], [b]) => (a < b ? -1 : 1));
    const kennung = JSON.stringify(liste);
    if (baumKennungen.has(kennung)) return baumKennungen.get(kennung);
    const sha = `tree${++zaehler}`;
    baeume.set(sha, new Map(liste));
    baumKennungen.set(kennung, sha);
    return sha;
  };
  const neuerCommit = (baumSha) => {
    const sha = `commit${++zaehler}`;
    commits.set(sha, baumSha);
    return sha;
  };

  // Wie bei GitHub nimmt `ref` einen Branch oder eine Commit-Kennung.
  const baumVon = (ref) => baeume.get(commits.get(branches.has(ref) ? branches.get(ref) : ref));
  branches.set("main", neuerCommit(neuerBaum(Object.entries(startDateien).map(([p, i]) => [p, neuerBlob(i)]))));

  const json = (data, status = 200) =>
    new Response(data === null ? null : JSON.stringify(data), {
      status: data === null ? 204 : status,
      headers: { "Content-Type": "application/json" },
    });

  const fetchImpl = async (url, init = {}) => {
    const u = new URL(typeof url === "string" ? url : url.url);
    const pfad = decodeURIComponent(u.pathname);
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(init.body) : null;

    /* --- Referenzen --- */
    const ref = pfad.match(/\/git\/refs?\/heads\/(.+)$/);
    if (ref && method === "GET") {
      const branch = ref[1];
      return branches.has(branch)
        ? json({ object: { sha: branches.get(branch) } })
        : json({ message: "Branch not found" }, 404);
    }
    if (ref && method === "PATCH") {
      branches.set(ref[1], body.sha);
      return json({});
    }
    if (/\/git\/refs$/.test(pfad) && method === "POST") {
      branches.set(body.ref.replace("refs/heads/", ""), body.sha);
      return json({});
    }

    /* --- Inhalt eines Branches --- */
    const contents = pfad.match(/^\/repos\/[^/]+\/[^/]+\/contents\/(.*)$/);
    if (contents && method === "GET") {
      const baum = baumVon(u.searchParams.get("ref") || "main");
      const blobSha = baum?.get(contents[1]);
      if (!blobSha) return json({ message: "Not Found" }, 404);
      const inhalt = blobs.get(blobSha);
      // Wie GitHub: base64 der UTF-8-Bytes — die Inhalte enthalten Umlaute.
      return json({
        type: "file",
        sha: blobSha,
        size: inhalt.length,
        content: Buffer.from(inhalt, "utf8").toString("base64"),
      });
    }

    /* --- Commit bauen --- */
    const commitLesen = pfad.match(/\/git\/commits\/(commit\d+)$/);
    if (commitLesen && method === "GET") return json({ tree: { sha: commits.get(commitLesen[1]) } });

    if (/\/git\/blobs$/.test(pfad) && method === "POST") {
      return json({ sha: neuerBlob(body.encoding === "base64" ? atob(body.content) : body.content) });
    }

    if (/\/git\/trees$/.test(pfad) && method === "POST") {
      const eintraege = new Map(baeume.get(body.base_tree));
      for (const e of body.tree) {
        if (e.sha === null) eintraege.delete(e.path);
        else eintraege.set(e.path, e.sha);
      }
      return json({ sha: neuerBaum(eintraege) });
    }

    if (/\/git\/commits$/.test(pfad) && method === "POST") return json({ sha: neuerCommit(body.tree) });

    /* --- Merge (Testseite nachziehen) --- */
    if (/\/merges$/.test(pfad) && method === "POST") {
      if (mergeKonflikt) return json({ message: "Merge conflict" }, 409);
      const basis = baumVon(body.base);
      const quelle = baumVon(body.head);
      if (commits.get(branches.get(body.base)) === commits.get(branches.get(body.head))) return json(null);
      const gemischt = new Map([...basis, ...quelle]);
      const sha = neuerCommit(neuerBaum(gemischt));
      branches.set(body.base, sha);
      return json({ sha });
    }

    throw new Error(`Nicht nachgebaut: ${method} ${pfad}`);
  };

  return {
    fetchImpl,
    /** Fremder Commit auf einem Branch — z. B. ein gemergter Pull Request auf main. */
    commitAuf: (branch, dateien) => {
      const eintraege = new Map(baumVon(branch));
      for (const [pfad, inhalt] of Object.entries(dateien)) eintraege.set(pfad, neuerBlob(inhalt));
      const sha = neuerCommit(neuerBaum(eintraege));
      branches.set(branch, sha);
      return sha;
    },
    branches: () => [...branches.keys()].sort(),
    head: (branch) => branches.get(branch) || null,
    dateien: (branch) => [...(baumVon(branch)?.keys() || [])].sort(),
    inhalt: (branch, pfad) => {
      const sha = baumVon(branch)?.get(pfad);
      return sha ? blobs.get(sha) : null;
    },
  };
}
