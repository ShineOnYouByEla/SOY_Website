/* ============================================================
   Veroeffentlichen per GitHub-API
   ------------------------------------------------------------
   Ein Publish = ein Commit auf den Ziel-Branch. Ueber die
   Git-Data-API, damit mehrere Dateien (site.json + Bilder) in
   einem einzigen Commit landen und die Seite nie halbfertig
   deployt wird.
   ============================================================ */

const API = "https://api.github.com";

class GitHubError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "GitHubError";
    this.status = status;
  }
}

function headers(env) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "soy-admin",
    "Content-Type": "application/json",
  };
}

async function gh(env, path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: headers(env) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let message = `GitHub ${res.status}`;
    try {
      const parsed = JSON.parse(body);
      if (parsed.message) message += `: ${parsed.message}`;
    } catch {
      if (body) message += `: ${body.slice(0, 200)}`;
    }
    throw new GitHubError(message, res.status);
  }
  return res.status === 204 ? null : res.json();
}

/** Prueft Token und Repo-Zugriff — fuer die Statusanzeige im Admin. */
export async function checkAccess(env) {
  const repo = await gh(env, `/repos/${env.GITHUB_REPO}`);
  return {
    repo: repo.full_name,
    defaultBranch: repo.default_branch,
    canPush: Boolean(repo.permissions?.push),
  };
}

/** Aktueller Stand eines Branches — ohne Angabe der des Ziel-Branches. */
export async function getBranchHead(env, branch = null) {
  const ref = await gh(env, `/repos/${env.GITHUB_REPO}/git/ref/heads/${encodeURI(branch || env.GITHUB_BRANCH)}`);
  return ref.object.sha;
}

/**
 * Legt den Branch an, falls es ihn noch nicht gibt — abgezweigt vom
 * Ziel-Branch. Gibt zurueck, ob er neu entstanden ist.
 */
export async function ensureBranch(env, branch, from = null) {
  try {
    await getBranchHead(env, branch);
    return false;
  } catch (err) {
    if (!(err instanceof GitHubError && err.status === 404)) throw err;
    const sha = await getBranchHead(env, from);
    await gh(env, `/repos/${env.GITHUB_REPO}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
    });
    return true;
  }
}

/**
 * Bringt `branch` auf den Stand von `from` (in der Regel: Testing auf Live).
 * Normalfall ist ein Merge, damit auf dem Branch nichts verlorengeht. Sind
 * beide Seiten am selben Inhalt auseinandergelaufen, kann GitHub nicht
 * mischen — dann wird der Branch hart auf den Live-Stand gesetzt. Der
 * Entwurf liegt in der Datenbank, es geht also nichts Unersetzliches
 * verloren.
 * @returns {Promise<{mode: "merge"|"aktuell"|"reset", sha: string|null}>}
 */
export async function syncBranch(env, branch, from = null) {
  const quelle = from || env.GITHUB_BRANCH;
  await ensureBranch(env, branch, quelle);

  try {
    const merge = await gh(env, `/repos/${env.GITHUB_REPO}/merges`, {
      method: "POST",
      body: JSON.stringify({
        base: branch,
        head: quelle,
        commit_message: `${quelle} in ${branch} übernommen`,
      }),
    });
    // 204 (also null) bedeutet: der Branch war bereits auf dem Stand.
    return merge ? { mode: "merge", sha: merge.sha } : { mode: "aktuell", sha: null };
  } catch (err) {
    if (!(err instanceof GitHubError) || err.status !== 409) throw err;
    const sha = await getBranchHead(env, quelle);
    await gh(env, `/repos/${env.GITHUB_REPO}/git/refs/heads/${encodeURI(branch)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha, force: true }),
    });
    return { mode: "reset", sha };
  }
}

/** Eine Datei aus dem Repository lesen. Gibt null zurueck, wenn es sie nicht gibt. */
export async function getFile(env, path, ref = null) {
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : `?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`;
  try {
    const data = await gh(env, `/repos/${env.GITHUB_REPO}/contents/${encodeURI(path)}${query}`);
    if (Array.isArray(data) || data.type !== "file") return null;
    // GitHub liefert base64 mit Zeilenumbruechen.
    const bytes = Uint8Array.from(atob(data.content.replace(/\n/g, "")), (ch) => ch.charCodeAt(0));
    return { sha: data.sha, bytes, size: data.size };
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) return null;
    throw err;
  }
}

/** Verzeichnisinhalt auflisten. */
export async function listDirectory(env, path) {
  try {
    const data = await gh(
      env,
      `/repos/${env.GITHUB_REPO}/contents/${encodeURI(path)}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`
    );
    if (!Array.isArray(data)) return [];
    return data
      .filter((e) => e.type === "file")
      .map((e) => ({ name: e.name, path: e.path, size: e.size, sha: e.sha }));
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) return [];
    throw err;
  }
}

/**
 * Mehrere Dateien in einem Commit schreiben, verschieben oder loeschen.
 * Pro Eintrag genau eine der drei Formen:
 *   { path, content, encoding }  neue oder geaenderte Datei
 *   { path, sha }                vorhandenen Inhalt an diesen Pfad legen
 *                                (Umbenennen, ohne die Datei erneut zu laden)
 *   { path, remove: true }       Datei entfernen
 * @param {Array<{path: string, content?: string, encoding?: "utf-8"|"base64", sha?: string, remove?: boolean}>} files
 * @param {{message: string, author?: {name: string, email: string}, expectedHead?: string, branch?: string}} opts
 */
export async function commitFiles(env, files, opts) {
  const repo = env.GITHUB_REPO;
  const branch = opts.branch || env.GITHUB_BRANCH;

  const headSha = await getBranchHead(env, branch);
  // Schutz vor dem Ueberschreiben fremder Aenderungen: hat sich der Branch
  // seit dem Laden bewegt, bricht der Publish ab.
  if (opts.expectedHead && opts.expectedHead !== headSha) {
    throw new GitHubError(
      "Das Repository wurde zwischenzeitlich geändert. Bitte die Seite neu laden und erneut veröffentlichen.",
      409
    );
  }

  const headCommit = await gh(env, `/repos/${repo}/git/commits/${headSha}`);

  // Fuer jede neue Datei erst einen Blob anlegen …
  const blobs = [];
  for (const file of files) {
    if (file.remove) {
      // sha: null im Baum bedeutet "Pfad entfernen".
      blobs.push({ path: file.path, mode: "100644", type: "blob", sha: null });
      continue;
    }
    if (file.sha) {
      blobs.push({ path: file.path, mode: "100644", type: "blob", sha: file.sha });
      continue;
    }
    const encoding = file.encoding || "utf-8";
    const blob = await gh(env, `/repos/${repo}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: file.content, encoding }),
    });
    blobs.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  // … dann einen Baum, der auf dem bisherigen aufsetzt …
  const tree = await gh(env, `/repos/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: headCommit.tree.sha, tree: blobs }),
  });

  /* Baeume sind ueber ihren Inhalt adressiert: kommt derselbe Baum heraus wie
     im letzten Commit, hat sich nichts geaendert. Dann bleibt es dabei —
     sonst saehe die Historie nach zweimal Speichern nach Arbeit aus, die es
     nie gab. */
  if (tree.sha === headCommit.tree.sha) {
    return {
      sha: headSha,
      branch,
      unchanged: true,
      url: `https://github.com/${repo}/commit/${headSha}`,
    };
  }

  // … und schliesslich den Commit.
  const commit = await gh(env, `/repos/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: opts.message,
      tree: tree.sha,
      parents: [headSha],
      ...(opts.author ? { author: opts.author } : {}),
    }),
  });

  await gh(env, `/repos/${repo}/git/refs/heads/${encodeURI(branch)}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });

  return {
    sha: commit.sha,
    branch,
    url: commit.html_url || `https://github.com/${repo}/commit/${commit.sha}`,
  };
}

/** Letzte Commits, die content/site.json beruehrt haben. */
export async function contentHistory(env, limit = 15) {
  const commits = await gh(
    env,
    `/repos/${env.GITHUB_REPO}/commits?path=content/site.json&sha=${encodeURIComponent(env.GITHUB_BRANCH)}&per_page=${limit}`
  );
  return commits.map((c) => ({
    sha: c.sha,
    shortSha: c.sha.slice(0, 7),
    message: c.commit.message.split("\n")[0],
    author: c.commit.author?.name || "unbekannt",
    date: c.commit.author?.date,
    url: c.html_url,
  }));
}

/** Status des zuletzt gestarteten Deploy-Workflows. */
export async function latestDeployRun(env) {
  try {
    const data = await gh(
      env,
      `/repos/${env.GITHUB_REPO}/actions/workflows/deploy-pages.yml/runs?branch=${encodeURIComponent(env.GITHUB_BRANCH)}&per_page=1`
    );
    const run = data.workflow_runs?.[0];
    if (!run) return null;
    return {
      status: run.status, // queued | in_progress | completed
      conclusion: run.conclusion, // success | failure | …
      startedAt: run.run_started_at,
      url: run.html_url,
    };
  } catch {
    // Der Deploy-Status ist Beiwerk: Fehler hier duerfen nichts blockieren.
    return null;
  }
}

export { GitHubError };
