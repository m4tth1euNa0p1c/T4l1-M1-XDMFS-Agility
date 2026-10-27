import { createHash } from "node:crypto";
import type { SyncSnapshotInput } from "../traceability/snapshot.js";

/**
 * Fictional demo project: "Aurore Pay", an instant SEPA transfer feature
 * built for a fictional bank ("Banque Aurore") by a fictional integrator
 * ("Nexalis Intégration") with two freelancers.
 *
 * Every name, URL and identifier here is invented. URLs use the reserved
 * example.com / example.org domains. The generator is deterministic: SHAs
 * are hashes of their content, dates are fixed.
 *
 * The scenario deliberately contains traceability gaps so that each
 * business question has something to show (see docs/runbooks/demo.md).
 */

const PROJECT_ID = "aurore-pay";
const JIRA = "https://banque-aurore.example.com/jira/browse";
const GH = "https://git.example.org/banque-aurore/aurore-pay";
const SONAR = "https://sonar.banque-aurore.example.com/dashboard?id=aurore-pay";

export const DEMO_MEMBERS = [
  { login: "s.morel", name: "Sophie Morel", organization: "banque-aurore", role: "Product Owner" },
  {
    login: "l.dubois",
    name: "Laurent Dubois",
    organization: "banque-aurore",
    role: "Architecte sécurité (RSSI)",
  },
  { login: "a.martin", name: "Amina Martin", organization: "nexalis", role: "Tech Lead" },
  {
    login: "j.nguyen",
    name: "Julien Nguyen",
    organization: "nexalis",
    role: "Développeur back-end",
  },
  { login: "r.petit", name: "Rose Petit", organization: "nexalis", role: "QA / testeuse" },
  { login: "m.leroy", name: "Marc Leroy", organization: "nexalis", role: "DevOps" },
  {
    login: "camille-r",
    name: "Camille Roux",
    organization: "freelance-camille",
    role: "Freelance front-end",
  },
  {
    login: "yanis-b",
    name: "Yanis Benali",
    organization: "freelance-yanis",
    role: "Freelance sécurité API",
  },
];

type IssueSeed = {
  key: string;
  summary: string;
  type: "Epic" | "Story" | "Bug" | "Task";
  status: "À faire" | "En cours" | "En revue" | "Terminé";
  assignee: string | null;
  sprint?: string;
  points?: number;
  priority?: "Haute" | "Moyenne" | "Basse" | "Critique";
  created: string;
  links?: Array<{ type: string; direction: "inward" | "outward"; relation: string; key: string }>;
};

const CATEGORY = {
  "À faire": "new",
  "En cours": "indeterminate",
  "En revue": "indeterminate",
  Terminé: "done",
} as const;

const ISSUES: IssueSeed[] = [
  {
    key: "PAY-1",
    summary: "Virement instantané SEPA (SCT Inst) dans l'application mobile",
    type: "Epic",
    status: "En cours",
    assignee: "Sophie Morel",
    priority: "Haute",
    created: "2026-08-24T09:00:00+02:00",
  },
  {
    key: "PAY-2",
    summary: "Authentification forte (SCA) avant validation du virement",
    type: "Story",
    status: "Terminé",
    assignee: "Julien Nguyen",
    sprint: "Sprint 1",
    points: 8,
    priority: "Critique",
    created: "2026-08-25T10:00:00+02:00",
  },
  {
    key: "PAY-3",
    summary: "Saisie du bénéficiaire et contrôle de l'IBAN",
    type: "Story",
    status: "Terminé",
    assignee: "Camille Roux",
    sprint: "Sprint 1",
    points: 5,
    priority: "Haute",
    created: "2026-08-25T10:30:00+02:00",
  },
  {
    key: "PAY-4",
    summary: "API d'initiation de virement instantané",
    type: "Story",
    status: "Terminé",
    assignee: "Julien Nguyen",
    sprint: "Sprint 2",
    points: 13,
    priority: "Critique",
    created: "2026-08-25T11:00:00+02:00",
  },
  {
    key: "PAY-5",
    summary: "Plafonds de virement par profil client",
    type: "Story",
    status: "Terminé",
    assignee: "Yanis Benali",
    sprint: "Sprint 2",
    points: 5,
    priority: "Haute",
    created: "2026-08-26T09:00:00+02:00",
  },
  {
    key: "PAY-6",
    summary: "Notification push de confirmation du virement",
    type: "Story",
    status: "Terminé",
    assignee: "Camille Roux",
    sprint: "Sprint 3",
    points: 3,
    priority: "Moyenne",
    created: "2026-08-26T09:30:00+02:00",
  },
  {
    key: "PAY-7",
    summary: "Vérification du nom du bénéficiaire (Verification of Payee)",
    type: "Story",
    status: "En cours",
    assignee: "Yanis Benali",
    sprint: "Sprint 5",
    points: 8,
    priority: "Critique",
    created: "2026-09-10T14:00:00+02:00",
  },
  {
    key: "PAY-8",
    summary: "Journal d'audit des virements (conformité DSP2)",
    type: "Story",
    status: "En revue",
    assignee: "Julien Nguyen",
    sprint: "Sprint 5",
    points: 5,
    priority: "Haute",
    created: "2026-09-10T14:30:00+02:00",
  },
  {
    key: "PAY-9",
    summary: "Double débit lors d'un timeout réseau",
    type: "Bug",
    status: "Terminé",
    assignee: "Julien Nguyen",
    sprint: "Sprint 3",
    points: 3,
    priority: "Critique",
    created: "2026-10-01T08:15:00+02:00",
  },
  {
    key: "PAY-10",
    summary: "Libellé du virement tronqué à 140 caractères",
    type: "Bug",
    status: "Terminé",
    assignee: "Camille Roux",
    sprint: "Sprint 3",
    points: 1,
    priority: "Basse",
    created: "2026-09-29T16:00:00+02:00",
  },
  {
    key: "PAY-11",
    summary: "Pipeline CI GitHub Actions et analyse SonarQube",
    type: "Task",
    status: "Terminé",
    assignee: "Marc Leroy",
    sprint: "Sprint 1",
    points: 3,
    priority: "Haute",
    created: "2026-08-24T15:00:00+02:00",
  },
  {
    key: "PAY-12",
    summary: "Tableau de bord des virements pour le back-office",
    type: "Story",
    status: "En cours",
    assignee: "Camille Roux",
    sprint: "Sprint 5",
    points: 8,
    priority: "Moyenne",
    created: "2026-09-15T10:00:00+02:00",
  },
  {
    key: "PAY-13",
    summary: "Score de risque anti-fraude en temps réel",
    type: "Story",
    status: "À faire",
    assignee: null,
    sprint: "Sprint 5",
    points: 13,
    priority: "Haute",
    created: "2026-09-15T11:00:00+02:00",
    links: [{ type: "Blocks", direction: "inward", relation: "is blocked by", key: "PAY-14" }],
  },
  {
    key: "PAY-14",
    summary: "Contrat d'interface avec le moteur anti-fraude du fournisseur",
    type: "Task",
    status: "En cours",
    assignee: "Laurent Dubois",
    sprint: "Sprint 5",
    points: 3,
    priority: "Haute",
    created: "2026-09-15T11:30:00+02:00",
    links: [{ type: "Blocks", direction: "outward", relation: "blocks", key: "PAY-13" }],
  },
  {
    key: "PAY-15",
    summary: "Accessibilité RGAA du parcours de virement",
    type: "Story",
    status: "À faire",
    assignee: null,
    points: 5,
    priority: "Moyenne",
    created: "2026-09-20T09:00:00+02:00",
  },
  {
    key: "PAY-16",
    summary: "Erreur 500 quand l'IBAN contient des espaces",
    type: "Bug",
    status: "Terminé",
    assignee: "Camille Roux",
    sprint: "Sprint 4",
    points: 2,
    priority: "Haute",
    created: "2026-10-08T11:00:00+02:00",
  },
  {
    key: "PAY-17",
    summary: "Chiffrement des données sensibles au repos",
    type: "Task",
    status: "Terminé",
    assignee: "Yanis Benali",
    sprint: "Sprint 4",
    points: 5,
    priority: "Critique",
    created: "2026-09-25T10:00:00+02:00",
  },
  {
    key: "PAY-18",
    summary: "Export du relevé de virements en PDF",
    type: "Story",
    status: "Terminé",
    assignee: "Julien Nguyen",
    sprint: "Sprint 4",
    points: 3,
    priority: "Basse",
    created: "2026-09-28T10:00:00+02:00",
  },
];

function sha(seed: string): string {
  // Fake 40-hex commit ids derived from SHA-256 (no security relevance).
  return createHash("sha256").update(seed).digest("hex").slice(0, 40);
}

interface CommitRec {
  sha: string;
  message: string;
  author: string;
  date: string;
  parents: string[];
}

export function buildBankDemoSnapshot(): SyncSnapshotInput {
  const commits: CommitRec[] = [];
  const pullRequests: NonNullable<SyncSnapshotInput["pullRequests"]> = [];
  const workflowRuns: NonNullable<SyncSnapshotInput["workflowRuns"]> = [];
  const qualityGates: NonNullable<SyncSnapshotInput["qualityGates"]> = [];
  const deployments: NonNullable<SyncSnapshotInput["deployments"]> = [];
  const releases: NonNullable<SyncSnapshotInput["releases"]> = [];
  let runId = 9100;
  let deployId = 700;

  const addCommit = (message: string, author: string, date: string, parents: string[]): string => {
    const s = sha(`${message}|${author}|${date}|${parents.join(",")}`);
    commits.push({ sha: s, message, author, date, parents });
    return s;
  };
  const ci = (
    headSha: string,
    branch: string,
    conclusion: "success" | "failure",
    date: string,
    event = "pull_request",
  ) => {
    runId += 1;
    workflowRuns.push({
      id: runId,
      name: "CI",
      status: "completed",
      conclusion,
      headSha,
      headBranch: branch,
      event,
      url: `${GH}/actions/runs/${runId}`,
      createdAt: date,
    });
  };
  const gate = (
    revision: string,
    branch: string,
    status: "OK" | "ERROR",
    date: string,
    failing: Array<{ metric: string; actual: string; threshold: string }> = [],
    coverage = "82.4",
  ) => {
    const analysisId = `AY${sha(revision + branch).slice(0, 10)}`;
    qualityGates.push({
      analysisId,
      revision,
      branch,
      status,
      date,
      url: `${SONAR}&branch=${encodeURIComponent(branch)}`,
      conditions: [
        {
          metric: "new_coverage",
          status: failing.some((f) => f.metric === "new_coverage") ? "ERROR" : "OK",
          actual: failing.find((f) => f.metric === "new_coverage")?.actual ?? coverage,
          threshold: "80",
        },
        {
          metric: "new_security_hotspots_reviewed",
          status: failing.some((f) => f.metric === "new_security_hotspots_reviewed")
            ? "ERROR"
            : "OK",
          actual:
            failing.find((f) => f.metric === "new_security_hotspots_reviewed")?.actual ?? "100",
          threshold: "100",
        },
        {
          metric: "new_reliability_rating",
          status: failing.some((f) => f.metric === "new_reliability_rating") ? "ERROR" : "OK",
          actual: failing.find((f) => f.metric === "new_reliability_rating")?.actual ?? "1",
          threshold: "1",
        },
      ],
      measures: {
        coverage,
        bugs: status === "ERROR" ? "2" : "0",
        vulnerabilities: "0",
        code_smells: status === "ERROR" ? "14" : "6",
      },
    });
  };

  let main = addCommit(
    "chore: initialise le dépôt Aurore Pay",
    "a.martin",
    "2026-08-31T09:00:00+02:00",
    [],
  );

  interface PrSeed {
    number: number;
    title: string;
    body?: string;
    author: string;
    branch: string;
    reviewers: string[];
    commits: Array<[message: string, author: string, date: string]>;
    ci: Array<"success" | "failure">;
    gate?: {
      status: "OK" | "ERROR";
      failing?: Array<{ metric: string; actual: string; threshold: string }>;
    };
    merge?: { by: string; date: string; mainGate?: "OK" | "ERROR" };
    created: string;
  }

  const openPr = (seed: PrSeed) => {
    const prCommits: string[] = [];
    let parent = main;
    for (const [message, author, date] of seed.commits) {
      parent = addCommit(message, author, date, [parent]);
      prCommits.push(parent);
    }
    const head = parent;
    // One CI run per push of the head commit (last entry = latest result).
    seed.ci.forEach((conclusion, i) =>
      ci(
        i === seed.ci.length - 1 ? head : prCommits[Math.max(0, prCommits.length - 2)]!,
        seed.branch,
        conclusion,
        seed.commits[seed.commits.length - 1]![2],
      ),
    );
    if (seed.gate)
      gate(
        head,
        `pr/${seed.number}`,
        seed.gate.status,
        seed.commits[seed.commits.length - 1]![2],
        seed.gate.failing,
      );
    let mergeCommitSha: string | null = null;
    if (seed.merge) {
      mergeCommitSha = addCommit(
        `Merge pull request #${seed.number} from ${seed.branch}`,
        seed.merge.by,
        seed.merge.date,
        [main, head],
      );
      main = mergeCommitSha;
      ci(main, "main", "success", seed.merge.date, "push");
      gate(
        main,
        "main",
        seed.merge.mainGate ?? "OK",
        seed.merge.date,
        seed.merge.mainGate === "ERROR"
          ? [{ metric: "new_coverage", actual: "61.0", threshold: "80" }]
          : [],
      );
    }
    pullRequests.push({
      number: seed.number,
      title: seed.title,
      state: seed.merge ? "closed" : "open",
      merged: Boolean(seed.merge),
      author: seed.author,
      headRef: seed.branch,
      baseRef: "main",
      headSha: head,
      body: seed.body ?? "",
      url: `${GH}/pull/${seed.number}`,
      createdAt: seed.created,
      mergedAt: seed.merge?.date ?? null,
      mergeCommitSha,
      commits: prCommits,
      reviewers: seed.reviewers,
    });
  };

  const deploy = (
    environment: "staging" | "production",
    status: "success" | "failure",
    date: string,
    actor: string,
  ) => {
    deployId += 1;
    deployments.push({
      id: deployId,
      sha: main,
      environment,
      status,
      createdAt: date,
      url: `${GH}/deployments/${deployId}`,
      actor,
    });
  };

  // ----- Sprint 1 (31/08 - 11/09) -----
  openPr({
    number: 1,
    title: "PAY-11 Pipeline CI et analyse SonarQube",
    author: "m.leroy",
    branch: "chore/PAY-11-ci-sonar",
    reviewers: ["a.martin"],
    created: "2026-09-01T10:00:00+02:00",
    commits: [
      ["ci: ajoute le workflow GitHub Actions (PAY-11)", "m.leroy", "2026-09-01T10:00:00+02:00"],
      ["ci: analyse SonarQube sur chaque PR (PAY-11)", "m.leroy", "2026-09-01T15:00:00+02:00"],
    ],
    ci: ["success"],
    gate: { status: "OK" },
    merge: { by: "a.martin", date: "2026-09-02T09:30:00+02:00" },
  });
  openPr({
    number: 2,
    title: "PAY-2 Authentification forte avant validation",
    body: "Implémente la SCA via l'application mobile. Revue sécurité : l.dubois.",
    author: "j.nguyen",
    branch: "feature/PAY-2-sca",
    reviewers: ["a.martin", "l.dubois"],
    created: "2026-09-03T09:00:00+02:00",
    commits: [
      ["feat(auth): défi SCA par notification (PAY-2)", "j.nguyen", "2026-09-03T09:00:00+02:00"],
      [
        "feat(auth): expiration du défi après 5 minutes (PAY-2)",
        "j.nguyen",
        "2026-09-04T11:00:00+02:00",
      ],
      ["test(auth): scénarios d'échec SCA (PAY-2)", "r.petit", "2026-09-07T14:00:00+02:00"],
    ],
    ci: ["failure", "success"],
    gate: { status: "OK" },
    merge: { by: "a.martin", date: "2026-09-08T10:00:00+02:00" },
  });
  openPr({
    number: 3,
    title: "PAY-3 Saisie du bénéficiaire et contrôle IBAN",
    author: "camille-r",
    branch: "feature/PAY-3-beneficiaire",
    reviewers: ["a.martin"],
    created: "2026-09-04T10:00:00+02:00",
    commits: [
      ["feat(ui): formulaire bénéficiaire (PAY-3)", "camille-r", "2026-09-04T10:00:00+02:00"],
      ["feat(ui): validation IBAN modulo 97 (PAY-3)", "camille-r", "2026-09-09T16:00:00+02:00"],
    ],
    ci: ["success"],
    gate: { status: "OK" },
    merge: { by: "a.martin", date: "2026-09-10T11:00:00+02:00" },
  });
  deploy("staging", "success", "2026-09-11T17:00:00+02:00", "m.leroy");

  // ----- Sprint 2 (14/09 - 25/09) -----
  openPr({
    number: 4,
    title: "PAY-4 API d'initiation de virement instantané",
    author: "j.nguyen",
    branch: "feature/PAY-4-api-initiation",
    reviewers: ["a.martin", "yanis-b"],
    created: "2026-09-14T09:00:00+02:00",
    commits: [
      [
        "feat(api): endpoint POST /virements-instantanes (PAY-4)",
        "j.nguyen",
        "2026-09-14T09:00:00+02:00",
      ],
      [
        "feat(api): idempotence par clé de requête (PAY-4)",
        "j.nguyen",
        "2026-09-16T15:00:00+02:00",
      ],
      [
        "feat(api): statut ACSC/RJCT conforme ISO 20022 (PAY-4)",
        "j.nguyen",
        "2026-09-18T10:00:00+02:00",
      ],
      ["test(api): tests de contrat de l'API (PAY-4)", "r.petit", "2026-09-21T14:00:00+02:00"],
    ],
    ci: ["success"],
    gate: { status: "OK" },
    merge: { by: "a.martin", date: "2026-09-22T09:00:00+02:00" },
  });
  openPr({
    number: 5,
    title: "PAY-5 Plafonds de virement par profil",
    author: "yanis-b",
    branch: "feature/PAY-5-plafonds",
    reviewers: ["j.nguyen"],
    created: "2026-09-17T10:00:00+02:00",
    commits: [
      ["feat(limits): plafonds par segment client (PAY-5)", "yanis-b", "2026-09-17T10:00:00+02:00"],
      ["feat(limits): plafond glissant sur 24 h (PAY-5)", "yanis-b", "2026-09-23T18:00:00+02:00"],
    ],
    // Merged despite a failing gate: a release risk the dashboard must surface.
    ci: ["success"],
    gate: {
      status: "ERROR",
      failing: [{ metric: "new_coverage", actual: "54.2", threshold: "80" }],
    },
    merge: { by: "j.nguyen", date: "2026-09-24T19:30:00+02:00", mainGate: "ERROR" },
  });
  // Untracked change on main: no ticket, no PR.
  main = addCommit("chore: mise à jour des dépendances", "m.leroy", "2026-09-25T08:30:00+02:00", [
    main,
  ]);
  ci(main, "main", "success", "2026-09-25T08:30:00+02:00", "push");
  deploy("staging", "success", "2026-09-25T17:00:00+02:00", "m.leroy");
  deploy("production", "success", "2026-09-28T07:00:00+02:00", "m.leroy");
  releases.push({
    tag: "v1.0.0",
    sha: main,
    date: "2026-09-28T07:00:00+02:00",
    url: `${GH}/releases/tag/v1.0.0`,
  });

  // ----- Sprint 3 (28/09 - 09/10) -----
  openPr({
    number: 6,
    title: "PAY-9 Corrige le double débit sur timeout",
    body: "Hotfix critique signalé par le support de la banque.",
    author: "j.nguyen",
    branch: "hotfix/PAY-9-double-debit",
    reviewers: ["a.martin", "l.dubois"],
    created: "2026-10-01T09:00:00+02:00",
    commits: [
      [
        "fix(api): verrou d'idempotence avant débit (PAY-9)",
        "j.nguyen",
        "2026-10-01T09:00:00+02:00",
      ],
      ["test(api): reproduit le timeout réseau (PAY-9)", "r.petit", "2026-10-01T13:00:00+02:00"],
    ],
    ci: ["success"],
    gate: { status: "OK" },
    merge: { by: "a.martin", date: "2026-10-01T15:00:00+02:00" },
  });
  deploy("production", "success", "2026-10-01T18:00:00+02:00", "m.leroy");
  openPr({
    number: 7,
    title: "Libellé du virement jusqu'à 140 caractères",
    body: "Corrige PAY-10.",
    author: "camille-r",
    branch: "fix/libelle-140",
    reviewers: ["a.martin"],
    created: "2026-10-02T10:00:00+02:00",
    commits: [["fix(ui): affiche le libellé complet", "camille-r", "2026-10-02T10:00:00+02:00"]],
    ci: ["success"],
    gate: { status: "OK" },
    merge: { by: "a.martin", date: "2026-10-05T09:00:00+02:00" },
  });
  openPr({
    number: 8,
    title: "PAY-6 Notification push de confirmation",
    author: "camille-r",
    branch: "feature/PAY-6-notification",
    reviewers: ["j.nguyen"],
    created: "2026-10-05T10:00:00+02:00",
    commits: [
      [
        "feat(push): notification après statut ACSC (PAY-6)",
        "camille-r",
        "2026-10-05T10:00:00+02:00",
      ],
      [
        "feat(push): texte accessible pour lecteur d'écran (PAY-6)",
        "camille-r",
        "2026-10-07T15:00:00+02:00",
      ],
    ],
    ci: ["success"],
    gate: { status: "OK" },
    merge: { by: "a.martin", date: "2026-10-08T10:00:00+02:00" },
  });
  // Refers to a ticket that is not synchronized.
  openPr({
    number: 9,
    title: "Refonte du README et guide d'onboarding",
    author: "a.martin",
    branch: "docs/readme",
    reviewers: ["m.leroy"],
    created: "2026-10-08T14:00:00+02:00",
    commits: [
      ["docs: guide d'onboarding des freelances", "a.martin", "2026-10-08T14:00:00+02:00"],
      ["docs: procédure de déploiement (voir PAY-99)", "m.leroy", "2026-10-09T09:00:00+02:00"],
    ],
    ci: ["success"],
    merge: { by: "m.leroy", date: "2026-10-09T11:00:00+02:00" },
  });
  deploy("staging", "success", "2026-10-09T17:00:00+02:00", "m.leroy");

  // ----- Sprint 4 (12/10 - 23/10) -----
  openPr({
    number: 10,
    title: "PAY-17 Chiffrement des données sensibles au repos",
    author: "yanis-b",
    branch: "feature/PAY-17-chiffrement",
    reviewers: ["l.dubois", "a.martin"],
    created: "2026-10-12T09:00:00+02:00",
    commits: [
      [
        "feat(crypto): enveloppe AES-256-GCM via KMS (PAY-17)",
        "yanis-b",
        "2026-10-12T09:00:00+02:00",
      ],
      ["feat(crypto): rotation des clés (PAY-17)", "yanis-b", "2026-10-14T16:00:00+02:00"],
    ],
    ci: ["failure", "success"],
    gate: { status: "OK" },
    merge: { by: "a.martin", date: "2026-10-15T10:00:00+02:00" },
  });
  openPr({
    number: 11,
    title: "Accepte les IBAN avec espaces",
    author: "camille-r",
    branch: "fix/pay-16-iban-espaces",
    reviewers: ["j.nguyen"],
    created: "2026-10-13T10:00:00+02:00",
    commits: [
      ["fix(api): normalise l'IBAN avant validation", "camille-r", "2026-10-13T10:00:00+02:00"],
    ],
    ci: ["success"],
    gate: { status: "OK" },
    merge: { by: "j.nguyen", date: "2026-10-14T09:00:00+02:00" },
  });
  deploy("staging", "success", "2026-10-16T17:00:00+02:00", "m.leroy");
  deploy("production", "failure", "2026-10-19T07:00:00+02:00", "m.leroy");
  // Rollback fix then successful production deployment (without PAY-6 retained? no: main includes all).
  main = addCommit(
    "fix(deploy): variable KMS manquante en production (PAY-17)",
    "m.leroy",
    "2026-10-19T09:00:00+02:00",
    [main],
  );
  ci(main, "main", "success", "2026-10-19T09:00:00+02:00", "push");
  deploy("production", "success", "2026-10-19T12:00:00+02:00", "m.leroy");
  releases.push({
    tag: "v1.1.0",
    sha: main,
    date: "2026-10-19T12:00:00+02:00",
    url: `${GH}/releases/tag/v1.1.0`,
  });

  // After the last production deployment: merged, only in staging.
  openPr({
    number: 12,
    title: "PAY-6 Son de notification configurable",
    author: "camille-r",
    branch: "feature/PAY-6-son",
    reviewers: ["a.martin"],
    created: "2026-10-20T10:00:00+02:00",
    commits: [
      [
        "feat(push): choix du son de notification (PAY-6)",
        "camille-r",
        "2026-10-20T10:00:00+02:00",
      ],
    ],
    ci: ["success"],
    gate: { status: "OK" },
    merge: { by: "a.martin", date: "2026-10-21T10:00:00+02:00" },
  });
  deploy("staging", "success", "2026-10-21T17:00:00+02:00", "m.leroy");

  // ----- Sprint 5, current (26/10 - 06/11) -----
  openPr({
    number: 13,
    title: "PAY-7 Vérification du nom du bénéficiaire",
    body: "Appel au service VoP de la banque. Attention : hotspot sur la journalisation du nom.",
    author: "yanis-b",
    branch: "feature/PAY-7-vop",
    reviewers: ["l.dubois"],
    created: "2026-10-22T09:00:00+02:00",
    commits: [
      [
        "feat(vop): client du service Verification of Payee (PAY-7)",
        "yanis-b",
        "2026-10-22T09:00:00+02:00",
      ],
      [
        "feat(vop): affichage du résultat de concordance (PAY-7)",
        "camille-r",
        "2026-10-26T11:00:00+01:00",
      ],
    ],
    ci: ["success"],
    gate: {
      status: "ERROR",
      failing: [
        { metric: "new_security_hotspots_reviewed", actual: "0", threshold: "100" },
        { metric: "new_coverage", actual: "71.5", threshold: "80" },
      ],
    },
  });
  openPr({
    number: 14,
    title: "PAY-8 Journal d'audit des virements",
    author: "j.nguyen",
    branch: "feature/PAY-8-audit",
    reviewers: ["l.dubois", "a.martin"],
    created: "2026-10-23T09:00:00+02:00",
    commits: [
      [
        "feat(audit): journal immuable des virements (PAY-8)",
        "j.nguyen",
        "2026-10-23T09:00:00+02:00",
      ],
      [
        "feat(audit): export pour l'équipe conformité (PAY-8)",
        "j.nguyen",
        "2026-10-26T15:00:00+01:00",
      ],
    ],
    ci: ["success"],
    gate: { status: "OK" },
  });
  openPr({
    number: 15,
    title: "Mise à jour de la configuration ESLint",
    author: "camille-r",
    branch: "chore/eslint",
    reviewers: [],
    created: "2026-10-26T16:00:00+01:00",
    commits: [["chore: règles ESLint du front", "camille-r", "2026-10-26T16:00:00+01:00"]],
    ci: ["failure"],
  });
  // Branch with commits but no PR yet (PAY-12).
  addCommit(
    "wip(backoffice): grille des virements (PAY-12)",
    "camille-r",
    "2026-10-26T18:00:00+01:00",
    [main],
  );

  const observedAt = "2026-10-27T09:00:00+01:00";
  return {
    project: {
      id: PROJECT_ID,
      name: "Aurore Pay : virement instantané",
      description:
        "Projet fictif de démonstration. Banque Aurore (client) confie à Nexalis Intégration (intégrateur) et à deux freelances le virement instantané SEPA de son application mobile. SonarQube (édition commerciale fictive) analyse aussi les PR.",
      jiraProjectKeys: ["PAY"],
      repository: { owner: "banque-aurore", repo: "aurore-pay" },
      sonarProjectKey: "aurore-pay",
      organizations: [
        { id: "banque-aurore", name: "Banque Aurore", role: "client" },
        { id: "nexalis", name: "Nexalis Intégration", role: "integrator" },
        { id: "freelance-camille", name: "Camille Roux (freelance)", role: "freelance" },
        { id: "freelance-yanis", name: "Yanis Benali (freelance)", role: "freelance" },
      ],
      members: DEMO_MEMBERS,
      demo: true,
    },
    observedAt,
    issues: ISSUES.map((i) => ({
      key: i.key,
      summary: i.summary,
      type: i.type,
      status: i.status,
      statusCategory: CATEGORY[i.status],
      assignee: i.assignee,
      ...(i.sprint ? { sprint: i.sprint } : {}),
      ...(i.points ? { storyPoints: i.points } : {}),
      ...(i.priority ? { priority: i.priority } : {}),
      created: i.created,
      updated: observedAt,
      url: `${JIRA}/${i.key}`,
      links: i.links ?? [],
    })),
    commits: commits.map((c) => ({ ...c, url: `${GH}/commit/${c.sha}` })),
    pullRequests,
    workflowRuns,
    qualityGates,
    deployments,
    releases,
  };
}
