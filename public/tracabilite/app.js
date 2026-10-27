/*
 * Tableau de traçabilité : lit l'API JSON (/api/...) et construit le DOM
 * avec createElement/textContent uniquement (jamais innerHTML), ce qui
 * empêche toute injection depuis les données synchronisées.
 */
(function () {
  "use strict";

  var etat = { projet: null, keys: [] };
  var $ = function (id) {
    return document.getElementById(id);
  };

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "text") node.textContent = attrs[k];
        else if (k === "className") node.className = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }
  function vider(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function api(path, options) {
    return fetch(path, options).then(function (r) {
      return r.json().then(function (body) {
        if (!r.ok) throw new Error(body.message || "Erreur " + r.status);
        return body;
      });
    });
  }
  function outil(nom, params) {
    var q = params ? "?" + new URLSearchParams(params).toString() : "";
    return api("/api/projects/" + encodeURIComponent(etat.projet) + "/tools/" + nom + q);
  }
  function erreur(message) {
    var box = $("erreur-globale");
    box.textContent = message;
    box.hidden = !message;
  }

  var LIBELLE_STATUT = {
    verified: "vérifié",
    inferred: "déduit",
    unknown: "inconnu",
    failed: "échec",
  };
  function pill(statut) {
    return el("span", { className: "pill pill-" + statut, text: LIBELLE_STATUT[statut] || statut });
  }

  // ---------------------------------------------------------------- KPI & équipe
  function afficherVue(vue, risques, graphe) {
    var d = vue.data;
    $("kpi-tickets").textContent = String(d.issues.total);
    $("kpi-tickets-sub").textContent =
      d.issues.done +
      " terminés · " +
      d.issues.inProgress +
      " en cours · " +
      d.issues.todo +
      " à faire";
    $("kpi-prod").textContent = String(d.issues.deliveredToProduction);
    $("kpi-prod-sub").textContent = "tickets présents dans le dernier déploiement réussi";
    var hautes = risques.data.filter(function (r) {
      return r.severity === "high";
    }).length;
    $("kpi-risques").textContent = String(risques.data.length);
    $("kpi-risques-sub").textContent = "dont " + hautes + " de gravité haute";
    var rel = d.stats.relations;
    var total = rel.verified + rel.inferred + rel.unknown;
    $("kpi-liens").textContent = rel.verified + " / " + rel.inferred;
    $("kpi-liens-bar").style.width = (total ? Math.round((rel.verified / total) * 100) : 0) + "%";
    $("kpi-liens-sub").textContent =
      (total ? Math.round((rel.verified / total) * 100) : 0) + " % des liens sont vérifiés";

    var commits = d.commitsByOrganization;
    var totalCommits = Object.keys(commits).reduce(function (s, k) {
      return s + commits[k];
    }, 0);
    $("equipe-sub").textContent = totalCommits + " commits tracés, répartis par organisation";
    var liste = $("liste-orgs");
    vider(liste);
    var ROLES = {
      client: "client",
      integrator: "intégrateur",
      freelance: "freelance",
      vendor: "fournisseur",
    };
    d.organizations.forEach(function (org) {
      var n = commits[org.id] || 0;
      var pct = totalCommits ? Math.round((n / totalCommits) * 100) : 0;
      var membres = d.members
        .filter(function (m) {
          return m.organization === org.id;
        })
        .map(function (m) {
          return m.name + " (" + m.role + ")";
        });
      var barre = el("span");
      barre.style.width = pct + "%";
      liste.appendChild(
        el("li", null, [
          el("div", { className: "org-row" }, [
            el("span", null, [
              org.name + " ",
              el("span", { className: "org-role", text: "· " + (ROLES[org.role] || org.role) }),
            ]),
            el("span", { className: "muted", text: n + " commits (" + pct + " %)" }),
          ]),
          el("div", { className: "org-bar", "aria-hidden": "true" }, [barre]),
          el("p", { className: "org-members", text: membres.join(", ") }),
        ]),
      );
    });

    var liens = vue.data.stats.entities;
    $("sync-info").textContent =
      (liens.PullRequest || 0) +
      " PR, " +
      (liens.Commit || 0) +
      " commits, " +
      (liens.Deployment || 0) +
      " déploiements synchronisés.";
    void graphe;
  }

  function afficherRisques(risques) {
    var liste = $("liste-risques");
    vider(liste);
    $("risques-compte").textContent = risques.data.length + " risque(s)";
    var LIB = { high: "Haute", medium: "Moyenne", low: "Basse" };
    risques.data.forEach(function (r) {
      liste.appendChild(
        el("li", null, [
          el("span", { className: "sev sev-" + r.severity, text: LIB[r.severity] }),
          el("span", { text: r.message }),
        ]),
      );
    });
    if (risques.data.length === 0) liste.appendChild(el("li", { text: "Aucun risque détecté." }));
  }

  // ---------------------------------------------------------------- Qualité des PR
  function afficherQualite(q) {
    var corps = $("table-qualite");
    vider(corps);
    q.data.forEach(function (r) {
      var ci =
        r.ci === "success"
          ? pill("verified")
          : r.ci === "failure"
            ? pill("failed")
            : pill("unknown");
      var gate =
        r.qualityGate === "OK"
          ? pill("verified")
          : r.qualityGate === "ERROR"
            ? pill("failed")
            : pill("unknown");
      corps.appendChild(
        el("tr", null, [
          el("td", { className: "key", text: "#" + r.number }),
          el("td", { text: r.title }),
          el("td", {
            text: r.state === "merged" ? "fusionnée" : r.state === "open" ? "ouverte" : "fermée",
          }),
          el("td", null, [ci, " " + r.ci]),
          el("td", null, [gate, " " + r.qualityGate]),
          el("td", { text: r.problems.join(" ; ") }),
        ]),
      );
    });
    if (q.data.length === 0)
      corps.appendChild(
        el("tr", null, [
          el("td", { colspan: "6", text: "Toutes les PR ont un contrôle qualité vérifié." }),
        ]),
      );
  }

  // ---------------------------------------------------------------- Tickets
  function afficherTickets(graphe, prod, staging) {
    var enProd = {};
    prod.data.issues.forEach(function (i) {
      enProd[i.key] = true;
    });
    var enStaging = {};
    staging.data.issues.forEach(function (i) {
      enStaging[i.key] = true;
    });
    var issues = graphe.entities
      .filter(function (e) {
        return e.type === "Issue" && !e.attributes.missing;
      })
      .sort(function (a, b) {
        return Number(a.key.split("-")[1]) - Number(b.key.split("-")[1]);
      });
    etat.keys = issues.map(function (i) {
      return i.key;
    });

    var corps = $("table-tickets");
    vider(corps);
    issues.forEach(function (i) {
      var livraison = enProd[i.key]
        ? el("span", { className: "badge badge-ok", text: "production" })
        : enStaging[i.key]
          ? el("span", { className: "badge badge-neutral", text: "staging" })
          : el("span", { className: "muted", text: "non livré" });
      corps.appendChild(
        el("tr", null, [
          el("td", { className: "key", text: i.key }),
          el("td", { text: i.title }),
          el("td", { text: i.attributes.type || "" }),
          el("td", { text: i.attributes.status || "" }),
          el("td", { text: i.attributes.sprint || "Backlog" }),
          el("td", null, [livraison]),
        ]),
      );
    });

    var choix = $("choix-ticket");
    vider(choix);
    issues.forEach(function (i) {
      choix.appendChild(el("option", { value: i.key, text: i.key + " - " + i.title }));
    });
    choix.value = issues.some(function (i) {
      return i.key === "PAY-6";
    })
      ? "PAY-6"
      : (issues[0] && issues[0].key) || "";
  }

  // ---------------------------------------------------------------- Chaîne de livraison
  function etape(nom, statut, detail) {
    return el("li", { className: "step", "data-status": statut }, [
      el("span", {
        className: "node",
        "aria-hidden": "true",
        text:
          statut === "verified"
            ? "✓"
            : statut === "failed"
              ? "!"
              : statut === "inferred"
                ? "~"
                : "?",
      }),
      el("span", { className: "step-name", text: nom }),
      pill(statut),
      el("span", { className: "step-detail", text: detail }),
    ]);
  }

  function afficherChaine(cle) {
    if (!cle) return;
    outil("traceability_get_issue_delivery_chain", { issue_key: cle })
      .then(function (a) {
        var d = a.data;
        var stepper = $("stepper");
        vider(stepper);
        if (!d) {
          $("chaine-titre").textContent = a.limitations[0] || "Ticket introuvable.";
          return;
        }
        $("chaine-titre").textContent =
          d.issue.key + " : " + d.issue.title + " (" + d.issue.status + ")";
        var meilleur = function (liste) {
          if (
            liste.some(function (x) {
              return x.linkStatus === "verified";
            })
          )
            return "verified";
          return liste.length ? "inferred" : "unknown";
        };
        var ciOk = d.builds.some(function (b) {
          return b.conclusion === "success";
        });
        var gateKo = d.qualityGates.some(function (g) {
          return g.status === "ERROR";
        });
        var gateOk = d.qualityGates.some(function (g) {
          return g.status === "OK";
        });
        var prod = d.deployments.filter(function (x) {
          return /^prod/i.test(x.environment) && x.status === "success";
        });

        stepper.appendChild(etape("Ticket", "verified", d.issue.sprint || "Backlog"));
        stepper.appendChild(
          etape(
            "Branche",
            d.branches.length ? "inferred" : "unknown",
            d.branches
              .map(function (b) {
                return b.name;
              })
              .join(", ") || "aucune",
          ),
        );
        stepper.appendChild(etape("Commits", meilleur(d.commits), d.commits.length + " commit(s)"));
        stepper.appendChild(
          etape(
            "Pull request",
            meilleur(d.pullRequests),
            d.pullRequests
              .map(function (p) {
                return "#" + p.number + (p.merged ? " fusionnée" : " ouverte");
              })
              .join(", ") || "aucune",
          ),
        );
        stepper.appendChild(
          etape(
            "CI",
            d.builds.length === 0 ? "unknown" : ciOk ? "verified" : "failed",
            d.builds.length ? d.builds.length + " build(s)" : "aucun build",
          ),
        );
        stepper.appendChild(
          etape(
            "SonarQube",
            d.qualityGates.length === 0
              ? "unknown"
              : gateKo
                ? "failed"
                : gateOk
                  ? "verified"
                  : "unknown",
            d.qualityGates
              .map(function (g) {
                return g.status;
              })
              .join(", ") || "aucune analyse",
          ),
        );
        stepper.appendChild(
          etape(
            "Déploiement",
            prod.length ? (d.partiallyDelivered ? "inferred" : "verified") : "unknown",
            prod.length
              ? d.partiallyDelivered
                ? "production partielle"
                : "production"
              : "non prouvé",
          ),
        );

        var manques = $("chaine-manques");
        var ul = manques.querySelector("ul");
        vider(ul);
        d.missing.forEach(function (m) {
          ul.appendChild(el("li", { text: m }));
        });
        manques.hidden = d.missing.length === 0;
      })
      .catch(function (e) {
        erreur(e.message);
      });
  }

  // ---------------------------------------------------------------- Assistant
  function bulle(role, texte, meta) {
    var li = el("li", { className: "bubble bubble-" + role, text: texte });
    if (meta) li.appendChild(meta);
    $("conversation").appendChild(li);
    li.scrollIntoView({ block: "end" });
    return li;
  }

  function metaReponse(r) {
    var frag = document.createDocumentFragment();
    var sources = r.answer ? r.answer.sources.slice(0, 6) : [];
    if (sources.length) {
      var ligne = el("div", { className: "bubble-meta" }, [el("span", { text: "Sources :" })]);
      sources.forEach(function (s) {
        ligne.appendChild(el("span", { className: "source", text: s.label }));
      });
      frag.appendChild(ligne);
    }
    if (r.toolCalls && r.toolCalls.length) {
      var outils = el("div", { className: "bubble-meta" }, [el("span", { text: "Outils :" })]);
      r.toolCalls.forEach(function (t) {
        outils.appendChild(
          el("span", { className: "source", text: t.name.replace("traceability_", "") }),
        );
      });
      frag.appendChild(outils);
    }
    if (r.answer && r.answer.limitations.length) {
      frag.appendChild(
        el("p", { className: "limits", text: "Limites : " + r.answer.limitations.join(" ") }),
      );
    }
    var mode = el("div", { className: "bubble-meta" }, [
      el("span", {
        text:
          r.mode === "llm"
            ? "Réponse générée par le LLM (" + r.model + ")"
            : "Réponse déterministe" +
              (r.fallbackReason ? " (repli : " + r.fallbackReason + ")" : ""),
      }),
    ]);
    frag.appendChild(mode);
    return frag;
  }

  function poser(question) {
    if (!question || !etat.projet) return;
    bulle("user", question);
    $("ask-statut").textContent = "Analyse en cours…";
    $("envoyer-question").disabled = true;
    api("/api/projects/" + encodeURIComponent(etat.projet) + "/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: question, mode: "auto" }),
    })
      .then(function (r) {
        bulle("bot", r.text, metaReponse(r));
        $("ask-statut").textContent = "";
      })
      .catch(function (e) {
        bulle("bot", "Erreur : " + e.message);
        $("ask-statut").textContent = "";
      })
      .finally(function () {
        $("envoyer-question").disabled = false;
      });
  }

  // ---------------------------------------------------------------- Chargement
  function chargerProjet(id) {
    etat.projet = id;
    erreur("");
    var p = encodeURIComponent(id);
    return Promise.all([
      api("/api/projects/" + p),
      outil("traceability_project_overview"),
      outil("traceability_get_release_risks"),
      api("/api/projects/" + p + "/graph"),
      outil("traceability_deployed_changes", { environment: "production" }),
      outil("traceability_deployed_changes", { environment: "staging" }),
      outil("traceability_get_pull_request_quality"),
    ])
      .then(function (r) {
        $("badge-demo").hidden = !r[0].demo;
        afficherVue(r[1], r[2], r[3]);
        afficherRisques(r[2]);
        afficherTickets(r[3], r[4], r[5]);
        afficherQualite(r[6]);
        afficherChaine($("choix-ticket").value);
      })
      .catch(function (e) {
        erreur("Impossible de charger le projet : " + e.message);
      });
  }

  function init() {
    api("/api/status")
      .then(function (s) {
        var llm = s.llm && s.llm.provider && s.llm.provider !== "none";
        $("badge-llm").textContent = llm ? "LLM : " + s.llm.provider : "Mode déterministe";
        $("badge-llm").className = "badge " + (llm ? "badge-ok" : "badge-neutral");
        $("assistant-mode").textContent = llm
          ? "Le LLM interroge le graphe via des outils en lecture seule. Repli déterministe en cas d'erreur."
          : "Réponses déterministes calculées sur le graphe (aucun LLM configuré).";
      })
      .catch(function () {});

    api("/api/projects")
      .then(function (projets) {
        var select = $("projet");
        projets.forEach(function (p) {
          select.appendChild(
            el("option", { value: p.id, text: p.name + (p.demo ? " (démo)" : "") }),
          );
        });
        if (projets.length === 0) {
          erreur("Aucun projet synchronisé.");
          return;
        }
        select.addEventListener("change", function () {
          chargerProjet(select.value);
        });
        chargerProjet(projets[0].id);
      })
      .catch(function () {
        erreur(
          "API indisponible. Lancez le serveur avec « npm run dev » puis ouvrez http://127.0.0.1:3000/tracabilite/.",
        );
      });

    $("choix-ticket").addEventListener("change", function (e) {
      afficherChaine(e.target.value);
    });
    $("form-question").addEventListener("submit", function (e) {
      e.preventDefault();
      var champ = $("question");
      var q = champ.value.trim();
      champ.value = "";
      poser(q);
    });
    Array.prototype.forEach.call(document.querySelectorAll("#suggestions .chip"), function (b) {
      b.addEventListener("click", function () {
        poser(b.textContent);
      });
    });
  }

  init();
})();
