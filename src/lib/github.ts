import { getSetting } from "./db";

const GH_API = "https://api.github.com";

function getToken(): string {
  const t = getSetting("github_token") || process.env.GITHUB_ADMIN_TOKEN || "";
  if (!t) throw new Error("GitHub admin token not configured");
  return t;
}

function getOrg(): string {
  return getSetting("github_org") || process.env.GITHUB_ORG || "";
}

async function ghFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(`${GH_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${body}`);
  }
  return res.json();
}

// Create a new private repo for a site
export async function createSiteRepo(siteName: string, siteId: string): Promise<{ full_name: string; html_url: string; clone_url: string }> {
  const org = getOrg();
  const repoName = `wpspot-site-${siteId.slice(0, 8)}`;
  const endpoint = org ? `/orgs/${org}/repos` : `/user/repos`;

  const repo = await ghFetch(endpoint, {
    method: "POST",
    body: JSON.stringify({
      name: repoName,
      description: `WPSpot site: ${siteName}`,
      private: true,
      auto_init: false,
      has_issues: false,
      has_projects: false,
      has_wiki: false,
    }),
  });
  return { full_name: repo.full_name, html_url: repo.html_url, clone_url: repo.clone_url };
}

// Push multiple files to a repo in one commit
export async function pushFiles(
  repoFullName: string,
  branch: string,
  files: Array<{ path: string; content: string }>,
  commitMsg: string
) {
  // Get or create branch ref
  let sha: string | undefined;
  try {
    const ref = await ghFetch(`/repos/${repoFullName}/git/ref/heads/${branch}`);
    sha = ref.object.sha;
  } catch {
    // Branch doesn't exist — init with empty tree
  }

  // Create blobs
  const blobs = await Promise.all(
    files.map((f) =>
      ghFetch(`/repos/${repoFullName}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: Buffer.from(f.content).toString("base64"), encoding: "base64" }),
      }).then((b: any) => ({ path: f.path, mode: "100644", type: "blob", sha: b.sha }))
    )
  );

  // Create tree
  const baseTree = sha
    ? (await ghFetch(`/repos/${repoFullName}/git/commits/${sha}`)).tree.sha
    : undefined;

  const tree = await ghFetch(`/repos/${repoFullName}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ tree: blobs, ...(baseTree ? { base_tree: baseTree } : {}) }),
  });

  // Create commit
  const commit = await ghFetch(`/repos/${repoFullName}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: commitMsg,
      tree: tree.sha,
      ...(sha ? { parents: [sha] } : {}),
    }),
  });

  // Update or create ref
  if (sha) {
    await ghFetch(`/repos/${repoFullName}/git/refs/heads/${branch}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha }),
    });
  } else {
    await ghFetch(`/repos/${repoFullName}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
    });
  }
  return commit.sha;
}

// Add GitHub Actions secret to a repo
export async function setRepoSecret(repoFullName: string, secretName: string, secretValue: string) {
  // Get public key for encryption
  const keyData = await ghFetch(`/repos/${repoFullName}/actions/secrets/public-key`);
  const encryptedValue = await encryptSecret(secretValue, keyData.key);

  await ghFetch(`/repos/${repoFullName}/actions/secrets/${secretName}`, {
    method: "PUT",
    body: JSON.stringify({ encrypted_value: encryptedValue, key_id: keyData.key_id }),
  });
}

// Trigger a workflow dispatch
export async function triggerWorkflow(repoFullName: string, workflowId: string, ref = "main", inputs: Record<string, string> = {}) {
  await ghFetch(`/repos/${repoFullName}/actions/workflows/${workflowId}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref, inputs }),
  });
}

// Encrypt secret using libsodium (tweetnacl fallback)
async function encryptSecret(secret: string, publicKey: string): Promise<string> {
  // Use Web Crypto / tweetnacl for encryption
  // In production use @octokit/core which handles this automatically
  // Here we use a simple base64 passthrough for the template (replace with actual libsodium in prod)
  const sodium = await import("libsodium-wrappers").catch(() => null);
  if (sodium) {
    await sodium.ready;
    const keyBytes = Buffer.from(publicKey, "base64");
    const secretBytes = Buffer.from(secret);
    const encrypted = sodium.crypto_box_seal(secretBytes, keyBytes);
    return Buffer.from(encrypted).toString("base64");
  }
  // Fallback: base64 encode (replace with proper encryption in production)
  return Buffer.from(secret).toString("base64");
}
