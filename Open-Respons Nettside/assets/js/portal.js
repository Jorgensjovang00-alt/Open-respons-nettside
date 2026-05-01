/*
	Open-Respons Anbudsportal
	Frontend-prototype: alt lagres i localStorage. Lukket anbudsmodell.
*/

(function () {
	'use strict';

	/* ============================================================
	   Constants
	   ============================================================ */

	var SCHEMA_VERSION = '2';

	var KEYS = {
		schema: 'or_portal_schema_version',
		session: 'or_portal_session',
		oppdrag: 'or_portal_oppdrag',
		bud: 'or_portal_bud',
		users: 'or_portal_users',
		vekterTab: 'or_portal_vekter_tab'
	};

	var STATUS_LABELS = {
		apen: 'Åpen',
		tildelt: 'Tildelt',
		kansellert: 'Kansellert',
		fullfort: 'Fullført',
		innsendt: 'Innsendt',
		akseptert: 'Akseptert',
		avslatt: 'Avslått',
		trukket: 'Trukket'
	};

	var TYPE_LABELS = {
		stasjonaer: 'Stasjonær vekter',
		patrulje: 'Patruljerende vekter',
		arrangement: 'Arrangement / event'
	};

	var KRAV_LABELS = {
		uniformert: 'Uniformert',
		sertifisert: 'Sertifisert',
		hund: 'Med hund',
		kjoretoy: 'Med kjøretøy',
		forstehjelp: 'Førstehjelpskurs'
	};

	var SPRAK_LABELS = {
		nb: 'Norsk',
		en: 'Engelsk'
	};

	/* ============================================================
	   Util
	   ============================================================ */

	var Util = {
		uid: function (prefix) {
			var rand = Math.random().toString(36).slice(2, 8);
			var date = new Date().toISOString().slice(0, 10);
			return prefix + '-' + date + '-' + rand;
		},

		// Deterministisk hash av en streng (32-bit, hex). Brukes til stabil customerId basert pa firma+epost.
		hash: function (str) {
			var h = 0x811c9dc5;
			for (var i = 0; i < str.length; i++) {
				h ^= str.charCodeAt(i);
				h = (h * 0x01000193) >>> 0;
			}
			return h.toString(16).padStart(8, '0');
		},

		escapeHtml: function (str) {
			if (str === null || str === undefined) return '';
			return String(str)
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#39;');
		},

		formatDateRange: function (startDato, sluttDato, startTid, sluttTid) {
			var start = Util.formatDate(startDato) + ' ' + (startTid || '');
			if (startDato === sluttDato) {
				return start.trim() + ' – ' + (sluttTid || '');
			}
			return start.trim() + ' – ' + (Util.formatDate(sluttDato) + ' ' + (sluttTid || '')).trim();
		},

		formatDate: function (iso) {
			if (!iso) return '';
			var parts = iso.split('-');
			if (parts.length !== 3) return iso;
			return parts[2] + '.' + parts[1] + '.' + parts[0];
		},

		formatNok: function (n) {
			if (n === null || n === undefined || n === '') return '–';
			var num = Number(n);
			if (isNaN(num)) return '–';
			return num.toLocaleString('nb-NO') + ' kr';
		},

		formatTimestamp: function (iso) {
			if (!iso) return '';
			var d = new Date(iso);
			if (isNaN(d.getTime())) return iso;
			return d.toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' });
		},

		// Beregn antall timer mellom start og slutt (kan strekke seg over midnatt eller flere dager).
		calcHours: function (startDato, sluttDato, startTid, sluttTid) {
			if (!startDato || !sluttDato || !startTid || !sluttTid) return 0;
			var start = new Date(startDato + 'T' + startTid + ':00');
			var slutt = new Date(sluttDato + 'T' + sluttTid + ':00');
			if (isNaN(start.getTime()) || isNaN(slutt.getTime())) return 0;
			var diffMs = slutt.getTime() - start.getTime();
			if (diffMs <= 0) return 0;
			return Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
		},

		byId: function (id) {
			return document.getElementById(id);
		},

		clearChildren: function (el) {
			while (el && el.firstChild) el.removeChild(el.firstChild);
		},

		validEmail: function (s) {
			return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));
		}
	};

	/* ============================================================
	   Storage
	   ============================================================ */

	var Storage = {
		_get: function (key, fallback) {
			try {
				var raw = localStorage.getItem(key);
				if (raw === null || raw === undefined) return fallback;
				return JSON.parse(raw);
			} catch (e) {
				console.warn('[portal] Korrupt localStorage-data for', key, '— tilbakestiller');
				localStorage.removeItem(key);
				return fallback;
			}
		},

		_set: function (key, value) {
			try {
				localStorage.setItem(key, JSON.stringify(value));
			} catch (e) {
				console.error('[portal] Klarte ikke å lagre', key, e);
				Flash.show('Klarte ikke å lagre data lokalt. Sjekk om nettleseren tillater localStorage.', 'error');
			}
		},

		ensureSchema: function () {
			var current = localStorage.getItem(KEYS.schema);
			if (current !== SCHEMA_VERSION) {
				if (current !== null) {
					localStorage.removeItem(KEYS.session);
					localStorage.removeItem(KEYS.oppdrag);
					localStorage.removeItem(KEYS.bud);
					localStorage.removeItem(KEYS.users);
					localStorage.removeItem(KEYS.vekterTab);
					Flash.show('Demoversjonen ble oppdatert. Logg inn på nytt.', 'info');
				}
				localStorage.setItem(KEYS.schema, SCHEMA_VERSION);
			}
		},

		listUsers: function () {
			var arr = Storage._get(KEYS.users, []);
			return Array.isArray(arr) ? arr : [];
		},

		findUser: function (rolle, brukernavn) {
			if (!brukernavn) return null;
			var key = brukernavn.toLowerCase().trim();
			var alle = Storage.listUsers();
			for (var i = 0; i < alle.length; i++) {
				if (alle[i].rolle === rolle && alle[i].brukernavn === key) return alle[i];
			}
			return null;
		},

		saveUser: function (user) {
			var alle = Storage.listUsers();
			alle.push(user);
			Storage._set(KEYS.users, alle);
		},

		updateUser: function (rolle, brukernavn, patch) {
			var alle = Storage.listUsers();
			var key = brukernavn.toLowerCase().trim();
			var changed = false;
			for (var i = 0; i < alle.length; i++) {
				if (alle[i].rolle === rolle && alle[i].brukernavn === key) {
					Object.keys(patch).forEach(function (k) { alle[i][k] = patch[k]; });
					changed = true;
					break;
				}
			}
			if (changed) Storage._set(KEYS.users, alle);
		},

		getSession: function () {
			return Storage._get(KEYS.session, null);
		},

		setSession: function (session) {
			Storage._set(KEYS.session, session);
		},

		clearSession: function () {
			localStorage.removeItem(KEYS.session);
		},

		listOppdrag: function () {
			var arr = Storage._get(KEYS.oppdrag, []);
			return Array.isArray(arr) ? arr : [];
		},

		getOppdrag: function (id) {
			var alle = Storage.listOppdrag();
			for (var i = 0; i < alle.length; i++) {
				if (alle[i].id === id) return alle[i];
			}
			return null;
		},

		saveOppdrag: function (oppdrag) {
			var alle = Storage.listOppdrag();
			alle.push(oppdrag);
			Storage._set(KEYS.oppdrag, alle);
		},

		updateOppdrag: function (id, patch) {
			var alle = Storage.listOppdrag();
			var changed = false;
			for (var i = 0; i < alle.length; i++) {
				if (alle[i].id === id) {
					Object.keys(patch).forEach(function (k) { alle[i][k] = patch[k]; });
					alle[i].updatedAt = new Date().toISOString();
					changed = true;
					break;
				}
			}
			if (changed) Storage._set(KEYS.oppdrag, alle);
			return changed;
		},

		listBud: function () {
			var arr = Storage._get(KEYS.bud, []);
			return Array.isArray(arr) ? arr : [];
		},

		listBudForOppdrag: function (oppdragId) {
			return Storage.listBud().filter(function (b) { return b.oppdragId === oppdragId; });
		},

		listBudForGuard: function (guardCompanyId) {
			return Storage.listBud().filter(function (b) { return b.guardCompanyId === guardCompanyId; });
		},

		findBud: function (oppdragId, guardCompanyId) {
			var alle = Storage.listBud();
			for (var i = 0; i < alle.length; i++) {
				if (alle[i].oppdragId === oppdragId && alle[i].guardCompanyId === guardCompanyId) {
					return alle[i];
				}
			}
			return null;
		},

		saveBud: function (bud) {
			var alle = Storage.listBud();
			alle.push(bud);
			Storage._set(KEYS.bud, alle);
		},

		updateBud: function (id, patch) {
			var alle = Storage.listBud();
			var changed = false;
			for (var i = 0; i < alle.length; i++) {
				if (alle[i].id === id) {
					Object.keys(patch).forEach(function (k) { alle[i][k] = patch[k]; });
					alle[i].updatedAt = new Date().toISOString();
					changed = true;
					break;
				}
			}
			if (changed) Storage._set(KEYS.bud, alle);
			return changed;
		},

		updateBudWhere: function (predicate, patch) {
			var alle = Storage.listBud();
			var changed = false;
			alle.forEach(function (b) {
				if (predicate(b)) {
					Object.keys(patch).forEach(function (k) { b[k] = patch[k]; });
					b.updatedAt = new Date().toISOString();
					changed = true;
				}
			});
			if (changed) Storage._set(KEYS.bud, alle);
		}
	};

	/* ============================================================
	   Flash messages
	   ============================================================ */

	var Flash = {
		_timer: null,

		show: function (message, level) {
			var el = Util.byId('portal-flash');
			if (!el) return;
			var cls = 'portal-flash';
			if (level === 'info') cls += ' portal-flash--info';
			else if (level === 'warn') cls += ' portal-flash--warn';
			else if (level === 'error') cls += ' portal-flash--error';
			el.innerHTML = '<div class="' + cls + '">' + Util.escapeHtml(message) + '</div>';
			if (Flash._timer) clearTimeout(Flash._timer);
			Flash._timer = setTimeout(function () {
				Util.clearChildren(el);
			}, 6000);
		},

		clear: function () {
			var el = Util.byId('portal-flash');
			if (el) Util.clearChildren(el);
		}
	};

	/* ============================================================
	   Renderers (return HTML strings)
	   ============================================================ */

	function renderStatusPill(status) {
		return '<span class="portal-status portal-status--' + status + '">' +
			Util.escapeHtml(STATUS_LABELS[status] || status) + '</span>';
	}

	function renderKravChips(krav) {
		if (!krav) return '<span style="color: rgba(255,255,255,0.5);">Ingen spesifikke krav</span>';
		var keys = Object.keys(krav).filter(function (k) { return krav[k]; });
		if (keys.length === 0) return '<span style="color: rgba(255,255,255,0.5);">Ingen spesifikke krav</span>';
		return '<ul class="portal-chip-list">' +
			keys.map(function (k) {
				return '<li class="portal-chip">' + Util.escapeHtml(KRAV_LABELS[k] || k) + '</li>';
			}).join('') + '</ul>';
	}

	function renderSprakChips(sprak) {
		if (!sprak || !sprak.length) return '<span style="color: rgba(255,255,255,0.5);">–</span>';
		return '<ul class="portal-chip-list">' +
			sprak.map(function (s) {
				return '<li class="portal-chip">' + Util.escapeHtml(SPRAK_LABELS[s] || s) + '</li>';
			}).join('') + '</ul>';
	}

	function renderOppdragDetailGrid(oppdrag, opts) {
		opts = opts || {};
		var hideKundeContact = !!opts.hideKundeContact;
		var hours = Util.calcHours(oppdrag.startDato, oppdrag.sluttDato, oppdrag.startTid, oppdrag.sluttTid);
		var rows = [];
		rows.push({ label: 'Tittel', value: Util.escapeHtml(oppdrag.tittel) });
		rows.push({ label: 'Type', value: Util.escapeHtml(TYPE_LABELS[oppdrag.type] || oppdrag.type) });
		rows.push({ label: 'Status', value: renderStatusPill(oppdrag.status) });
		rows.push({ label: 'Adresse', value: Util.escapeHtml(oppdrag.adresse) });
		rows.push({ label: 'Tidsrom', value: Util.escapeHtml(Util.formatDateRange(oppdrag.startDato, oppdrag.sluttDato, oppdrag.startTid, oppdrag.sluttTid)) });
		rows.push({ label: 'Antatt varighet', value: hours > 0 ? hours + ' timer' : '–' });
		rows.push({ label: 'Antall vektere', value: Util.escapeHtml(String(oppdrag.antallVektere)) });
		rows.push({ label: 'Krav', value: renderKravChips(oppdrag.krav) });
		rows.push({ label: 'Språkkrav', value: renderSprakChips(oppdrag.sprak) });
		if (oppdrag.budsjettMaks) {
			rows.push({ label: 'Budsjett maks', value: Util.formatNok(oppdrag.budsjettMaks) + '/time' });
		}
		if (!hideKundeContact) {
			rows.push({ label: 'Kunde', value: Util.escapeHtml(oppdrag.customerName) });
			if (oppdrag.kontaktEpost) {
				rows.push({ label: 'Kontakt-e-post', value: '<a href="mailto:' + Util.escapeHtml(oppdrag.kontaktEpost) + '">' + Util.escapeHtml(oppdrag.kontaktEpost) + '</a>' });
			}
			if (oppdrag.kontaktTelefon) {
				rows.push({ label: 'Telefon', value: Util.escapeHtml(oppdrag.kontaktTelefon) });
			}
		} else {
			rows.push({ label: 'Kunde', value: '<em style="color: rgba(255,255,255,0.6);">Anonymisert til budet er akseptert</em>' });
		}

		var html = '<dl class="portal-detail-grid">';
		rows.forEach(function (r) {
			html += '<div class="portal-detail-item"><dt>' + r.label + '</dt><dd>' + r.value + '</dd></div>';
		});
		html += '</dl>';

		if (oppdrag.beskrivelse) {
			html += '<h3 style="margin-top: 1.5rem;">Beskrivelse</h3>';
			html += '<p style="white-space: pre-wrap;">' + Util.escapeHtml(oppdrag.beskrivelse) + '</p>';
		}

		if (!hideKundeContact && oppdrag.notat) {
			html += '<h3 style="margin-top: 1.5rem;">Internt notat</h3>';
			html += '<p style="white-space: pre-wrap; color: rgba(255,255,255,0.7);">' + Util.escapeHtml(oppdrag.notat) + '</p>';
		}

		return html;
	}

	/* ============================================================
	   Views
	   ============================================================ */

	var Views = {

		showView: function (viewName) {
			var allViews = document.querySelectorAll('.portal-view');
			for (var i = 0; i < allViews.length; i++) {
				allViews[i].classList.remove('is-active');
			}
			var target = document.querySelector('[data-view="' + viewName + '"]');
			if (target) target.classList.add('is-active');
			window.scrollTo(0, 0);
		},

		renderSessionChip: function () {
			var el = Util.byId('portal-session');
			if (!el) return;
			var session = Storage.getSession();
			if (!session) {
				el.innerHTML = '';
				return;
			}
			var roleLabel = session.role === 'kunde' ? 'Kunde' : 'Vekter';
			var name = session.role === 'kunde' ? session.customerName : session.guardCompanyName;
			el.innerHTML =
				'<span class="portal-session-chip">' + Util.escapeHtml(roleLabel) + '</span>' +
				'<span>' + Util.escapeHtml(name || '') + '</span>' +
				'<a href="#bytt-rolle" class="button small">Bytt rolle</a>';
		},

		renderLanding: function () {
			Views.showView('landing');
			// Ingen dynamisk innhold — skjemaer er statiske i HTML.
			// Nullstill eventuelle gamle feilmeldinger
			var err = Util.byId('kunde-form-error');
			if (err) { err.hidden = true; err.textContent = ''; }
		},

		renderVekterLogin: function () {
			Views.showView('vekter-login');
			var err = Util.byId('vekter-form-error');
			if (err) { err.hidden = true; err.textContent = ''; }
			var form = Util.byId('form-role-vekter');
			if (form) form.reset();
			// Sett fokus pa forste felt
			var firstInput = Util.byId('vekter-firma');
			if (firstInput) {
				try { firstInput.focus(); } catch (e) {}
			}
		},

		renderKundeDashboard: function () {
			Views.showView('kunde');
			var session = Storage.getSession();
			var container = Util.byId('kunde-oppdrag-liste');
			if (!container) return;

			var alle = Storage.listOppdrag().filter(function (o) {
				return o.customerId === session.customerId;
			});

			// Nyeste først
			alle.sort(function (a, b) {
				return (b.createdAt || '').localeCompare(a.createdAt || '');
			});

			if (alle.length === 0) {
				container.innerHTML = '<div class="portal-empty">Du har ingen oppdrag ennå. Klikk «+ Nytt oppdrag» for å komme i gang.</div>';
				return;
			}

			var rows = alle.map(function (o) {
				var antallBud = Storage.listBudForOppdrag(o.id).filter(function (b) {
					return b.status === 'innsendt' || b.status === 'akseptert' || b.status === 'avslatt';
				}).length;
				return '<tr>' +
					'<td><a href="#kunde/oppdrag/' + Util.escapeHtml(o.id) + '" class="row-link">' + Util.escapeHtml(o.tittel) + '</a></td>' +
					'<td>' + Util.escapeHtml(TYPE_LABELS[o.type] || o.type) + '</td>' +
					'<td>' + Util.escapeHtml(Util.formatDate(o.startDato)) + '</td>' +
					'<td>' + Util.escapeHtml(String(o.antallVektere)) + '</td>' +
					'<td>' + renderStatusPill(o.status) + '</td>' +
					'<td>' + antallBud + '</td>' +
					'</tr>';
			}).join('');

			container.innerHTML =
				'<div class="portal-table-wrap"><table class="portal-table">' +
				'<thead><tr><th>Tittel</th><th>Type</th><th>Startdato</th><th>Antall</th><th>Status</th><th>Antall bud</th></tr></thead>' +
				'<tbody>' + rows + '</tbody></table></div>';
		},

		renderKundeNyForm: function () {
			Views.showView('kunde-ny');
			var form = Util.byId('form-nytt-oppdrag');
			if (form) form.reset();
			var err = Util.byId('ny-oppdrag-error');
			if (err) { err.hidden = true; err.textContent = ''; }
			// Default datoer: i dag
			var today = new Date().toISOString().slice(0, 10);
			var startDato = Util.byId('opp-startdato');
			var sluttDato = Util.byId('opp-sluttdato');
			if (startDato && !startDato.value) startDato.value = today;
			if (sluttDato && !sluttDato.value) sluttDato.value = today;
		},

		renderKundeOppdragDetail: function (id) {
			Views.showView('kunde-oppdrag');
			var session = Storage.getSession();
			var container = Util.byId('kunde-oppdrag-detalj');
			if (!container) return;

			var oppdrag = Storage.getOppdrag(id);
			if (!oppdrag) {
				container.innerHTML = '<div class="portal-flash portal-flash--error">Fant ikke oppdraget.</div>';
				return;
			}
			if (oppdrag.customerId !== session.customerId) {
				container.innerHTML = '<div class="portal-flash portal-flash--error">Du har ikke tilgang til dette oppdraget.</div>';
				return;
			}

			var bud = Storage.listBudForOppdrag(id);
			bud.sort(function (a, b) {
				return (a.timepris || 0) - (b.timepris || 0);
			});

			var canCancel = oppdrag.status === 'apen' || oppdrag.status === 'tildelt';
			var canComplete = oppdrag.status === 'tildelt';
			var canAcceptReject = oppdrag.status === 'apen';

			// Panel 1: detaljer
			var actionButtons = '';
			if (canCancel) {
				actionButtons += '<button type="button" class="button small danger" data-action="cancel-oppdrag" data-id="' + Util.escapeHtml(oppdrag.id) + '">Kanseller oppdrag</button> ';
			}
			if (canComplete) {
				actionButtons += '<button type="button" class="button small success" data-action="complete-oppdrag" data-id="' + Util.escapeHtml(oppdrag.id) + '">Marker som fullført</button>';
			}

			var html = '<div class="portal-box">';
			html += '<div class="portal-box-header"><h2>Oppdragsdetaljer</h2><div class="portal-box-actions">' + actionButtons + '</div></div>';
			html += renderOppdragDetailGrid(oppdrag, { hideKundeContact: false });
			html += '</div>';

			// Panel 2: bud
			html += '<div class="portal-box">';
			html += '<div class="portal-box-header"><h2>Mottatte bud (' + bud.length + ')</h2></div>';
			if (bud.length === 0) {
				html += '<div class="portal-empty">Ingen bud mottatt ennå.</div>';
			} else {
				var rows = bud.map(function (b) {
					var actions = '';
					if (canAcceptReject && b.status === 'innsendt') {
						actions += '<button type="button" class="button small success" data-action="accept-bud" data-bud="' + Util.escapeHtml(b.id) + '" data-oppdrag="' + Util.escapeHtml(oppdrag.id) + '">Aksepter</button> ';
						actions += '<button type="button" class="button small" data-action="reject-bud" data-bud="' + Util.escapeHtml(b.id) + '">Avslå</button>';
					} else if (b.status === 'akseptert') {
						actions = '<small>Akseptert ' + Util.escapeHtml(Util.formatTimestamp(b.updatedAt || b.createdAt)) + '</small>';
					} else if (b.status === 'avslatt') {
						actions = '<small>Avslått</small>';
					} else if (b.status === 'trukket') {
						actions = '<small>Trukket av vekter</small>';
					}

					return '<tr>' +
						'<td><strong>' + Util.escapeHtml(b.guardCompanyName) + '</strong>' +
						(b.guardOrgNr ? '<br><small>Org.nr ' + Util.escapeHtml(b.guardOrgNr) + '</small>' : '') + '</td>' +
						'<td>' + Util.formatNok(b.timepris) + '/t</td>' +
						'<td>' + Util.formatNok(b.totalpris) + '</td>' +
						'<td style="max-width: 18rem; white-space: pre-wrap; font-size: 0.9rem;">' + Util.escapeHtml(b.begrunnelse) + '</td>' +
						'<td>' + renderStatusPill(b.status) + '</td>' +
						'<td>' + Util.escapeHtml(Util.formatTimestamp(b.createdAt)) + '</td>' +
						'<td class="col-actions">' + actions + '</td>' +
						'</tr>';
				}).join('');

				html += '<div class="portal-table-wrap"><table class="portal-table">' +
					'<thead><tr><th>Selskap</th><th>Timepris</th><th>Totalpris</th><th>Begrunnelse</th><th>Status</th><th>Innsendt</th><th></th></tr></thead>' +
					'<tbody>' + rows + '</tbody></table></div>';

				// Vis aksepterte budets kontaktinfo separat
				var akseptert = bud.filter(function (b) { return b.status === 'akseptert'; })[0];
				if (akseptert) {
					html += '<div class="portal-bid-card is-accepted" style="margin-top: 1.5rem;">' +
						'<div class="portal-bid-card-header"><strong>Akseptert: ' + Util.escapeHtml(akseptert.guardCompanyName) + '</strong></div>' +
						'<dl class="portal-detail-grid">' +
						'<div class="portal-detail-item"><dt>Kontaktperson</dt><dd>' + Util.escapeHtml(akseptert.kontaktNavn) + '</dd></div>' +
						'<div class="portal-detail-item"><dt>E-post</dt><dd><a href="mailto:' + Util.escapeHtml(akseptert.kontaktEpost) + '">' + Util.escapeHtml(akseptert.kontaktEpost) + '</a></dd></div>' +
						(akseptert.kontaktTelefon ? '<div class="portal-detail-item"><dt>Telefon</dt><dd>' + Util.escapeHtml(akseptert.kontaktTelefon) + '</dd></div>' : '') +
						'</dl></div>';
				}
			}
			html += '</div>';

			container.innerHTML = html;
		},

		renderVekterDashboard: function () {
			Views.showView('vekter');
			var session = Storage.getSession();

			// Tab state
			var savedTab = sessionStorage.getItem(KEYS.vekterTab) || 'apne';
			Views._setActiveTab(savedTab);

			// Apne oppdrag (alle status: apen)
			var apneContainer = Util.byId('vekter-apne-liste');
			if (apneContainer) {
				var apne = Storage.listOppdrag().filter(function (o) { return o.status === 'apen'; });
				apne.sort(function (a, b) {
					return (b.createdAt || '').localeCompare(a.createdAt || '');
				});
				if (apne.length === 0) {
					apneContainer.innerHTML = '<div class="portal-empty">Ingen åpne oppdrag akkurat nå. Sjekk tilbake senere.</div>';
				} else {
					var rows = apne.map(function (o) {
						var existingBud = Storage.findBud(o.id, session.guardCompanyId);
						var budStatus;
						if (!existingBud || existingBud.status === 'trukket') {
							budStatus = '<span style="color: rgba(255,255,255,0.6);">Ikke budt</span>';
						} else {
							budStatus = renderStatusPill(existingBud.status);
						}
						return '<tr>' +
							'<td><a href="#vekter/oppdrag/' + Util.escapeHtml(o.id) + '" class="row-link"><strong>' + Util.escapeHtml(o.tittel) + '</strong></a></td>' +
							'<td>' + Util.escapeHtml(TYPE_LABELS[o.type] || o.type) + '</td>' +
							'<td>' + Util.escapeHtml(o.adresse) + '</td>' +
							'<td>' + Util.escapeHtml(Util.formatDate(o.startDato)) + ' ' + Util.escapeHtml(o.startTid || '') + '</td>' +
							'<td>' + Util.escapeHtml(String(o.antallVektere)) + '</td>' +
							'<td>' + budStatus + '</td>' +
							'</tr>';
					}).join('');
					apneContainer.innerHTML =
						'<div class="portal-table-wrap"><table class="portal-table">' +
						'<thead><tr><th>Tittel</th><th>Type</th><th>Adresse</th><th>Start</th><th>Antall</th><th>Mitt bud</th></tr></thead>' +
						'<tbody>' + rows + '</tbody></table></div>';
				}
			}

			// Mine anbud
			var mineContainer = Util.byId('vekter-mine-liste');
			if (mineContainer) {
				var mine = Storage.listBudForGuard(session.guardCompanyId);
				mine.sort(function (a, b) {
					return (b.createdAt || '').localeCompare(a.createdAt || '');
				});
				if (mine.length === 0) {
					mineContainer.innerHTML = '<div class="portal-empty">Du har ikke sendt inn noen anbud ennå.</div>';
				} else {
					var rows = mine.map(function (b) {
						var oppdrag = Storage.getOppdrag(b.oppdragId);
						var oppdragLabel = oppdrag ? oppdrag.tittel : '(slettet oppdrag)';
						var oppdragLink = oppdrag
							? '<a href="#vekter/oppdrag/' + Util.escapeHtml(oppdrag.id) + '" class="row-link"><strong>' + Util.escapeHtml(oppdragLabel) + '</strong></a>'
							: '<span style="color: rgba(255,255,255,0.5);">' + Util.escapeHtml(oppdragLabel) + '</span>';
						return '<tr>' +
							'<td>' + oppdragLink + '</td>' +
							'<td>' + Util.formatNok(b.timepris) + '/t</td>' +
							'<td>' + Util.formatNok(b.totalpris) + '</td>' +
							'<td>' + renderStatusPill(b.status) + '</td>' +
							'<td>' + Util.escapeHtml(Util.formatTimestamp(b.createdAt)) + '</td>' +
							'</tr>';
					}).join('');
					mineContainer.innerHTML =
						'<div class="portal-table-wrap"><table class="portal-table">' +
						'<thead><tr><th>Oppdrag</th><th>Timepris</th><th>Totalpris</th><th>Status</th><th>Innsendt</th></tr></thead>' +
						'<tbody>' + rows + '</tbody></table></div>';
				}
			}
		},

		_setActiveTab: function (name) {
			var tabs = document.querySelectorAll('.portal-tab');
			var panels = document.querySelectorAll('.portal-tab-panel');
			for (var i = 0; i < tabs.length; i++) {
				tabs[i].classList.toggle('is-active', tabs[i].getAttribute('data-tab') === name);
			}
			for (var j = 0; j < panels.length; j++) {
				panels[j].classList.toggle('is-active', panels[j].getAttribute('data-panel') === name);
			}
			sessionStorage.setItem(KEYS.vekterTab, name);
		},

		renderVekterOppdragDetail: function (id) {
			Views.showView('vekter-oppdrag');
			var session = Storage.getSession();
			var container = Util.byId('vekter-oppdrag-detalj');
			if (!container) return;

			var oppdrag = Storage.getOppdrag(id);
			if (!oppdrag) {
				container.innerHTML = '<div class="portal-flash portal-flash--error">Fant ikke oppdraget.</div>';
				return;
			}

			var existingBud = Storage.findBud(id, session.guardCompanyId);
			var isAccepted = existingBud && existingBud.status === 'akseptert';

			// Lukket anbudsmodell: kundeinfo skjules til budet er akseptert.
			var hideKundeContact = !isAccepted;

			var html = '<div class="portal-box">';
			html += '<div class="portal-box-header"><h2>Oppdragsdetaljer</h2><div>' + renderStatusPill(oppdrag.status) + '</div></div>';
			html += renderOppdragDetailGrid(oppdrag, { hideKundeContact: hideKundeContact });
			html += '</div>';

			// Anbudspanel — kun ditt eget bud, aldri konkurrenters.
			html += '<div class="portal-box">';

			if (oppdrag.status !== 'apen' && !existingBud) {
				html += '<div class="portal-empty">Dette oppdraget er ikke lenger åpent for nye anbud.</div>';
			} else if (existingBud && existingBud.status === 'innsendt') {
				html += '<div class="portal-box-header"><h2>Ditt bud</h2></div>';
				html += '<div class="portal-bid-card">' +
					'<dl class="portal-detail-grid">' +
					'<div class="portal-detail-item"><dt>Status</dt><dd>' + renderStatusPill(existingBud.status) + '</dd></div>' +
					'<div class="portal-detail-item"><dt>Timepris</dt><dd>' + Util.formatNok(existingBud.timepris) + '/t</dd></div>' +
					'<div class="portal-detail-item"><dt>Totalpris</dt><dd>' + Util.formatNok(existingBud.totalpris) + '</dd></div>' +
					'<div class="portal-detail-item"><dt>Innsendt</dt><dd>' + Util.escapeHtml(Util.formatTimestamp(existingBud.createdAt)) + '</dd></div>' +
					'</dl>' +
					'<h4 style="margin-top: 1rem;">Begrunnelse</h4>' +
					'<p style="white-space: pre-wrap; margin-bottom: 0;">' + Util.escapeHtml(existingBud.begrunnelse) + '</p>' +
					'<div class="portal-bid-card-actions">' +
					'<button type="button" class="button small danger" data-action="withdraw-bud" data-bud="' + Util.escapeHtml(existingBud.id) + '">Trekk bud</button>' +
					'</div></div>';
			} else if (existingBud && existingBud.status === 'akseptert') {
				html += '<div class="portal-box-header"><h2>Bud akseptert!</h2></div>';
				html += '<div class="portal-bid-card is-accepted">' +
					'<p>Kunden har akseptert ditt bud. Kontaktinformasjon er nå tilgjengelig over.</p>' +
					'<dl class="portal-detail-grid">' +
					'<div class="portal-detail-item"><dt>Status</dt><dd>' + renderStatusPill(existingBud.status) + '</dd></div>' +
					'<div class="portal-detail-item"><dt>Timepris</dt><dd>' + Util.formatNok(existingBud.timepris) + '/t</dd></div>' +
					'<div class="portal-detail-item"><dt>Totalpris</dt><dd>' + Util.formatNok(existingBud.totalpris) + '</dd></div>' +
					'</dl></div>';
			} else if (existingBud && existingBud.status === 'avslatt') {
				html += '<div class="portal-box-header"><h2>Bud avslått</h2></div>';
				html += '<div class="portal-bid-card is-rejected">' +
					'<p>Kunden har valgt et annet bud.</p>' +
					'<dl class="portal-detail-grid">' +
					'<div class="portal-detail-item"><dt>Timepris</dt><dd>' + Util.formatNok(existingBud.timepris) + '/t</dd></div>' +
					'<div class="portal-detail-item"><dt>Totalpris</dt><dd>' + Util.formatNok(existingBud.totalpris) + '</dd></div>' +
					'</dl></div>';
			} else {
				// Ingen bud ennå (eller trukket) — vis budskjema
				var hours = Util.calcHours(oppdrag.startDato, oppdrag.sluttDato, oppdrag.startTid, oppdrag.sluttTid);
				html += '<div class="portal-box-header"><h2>Send inn anbud</h2></div>';
				html += '<form id="form-nytt-bud" data-oppdrag="' + Util.escapeHtml(oppdrag.id) + '" data-hours="' + hours + '" novalidate>';
				html += '<div class="fields">';
				html += '<div class="field half"><label for="bud-timepris">Timepris (NOK)</label><input type="number" id="bud-timepris" name="timepris" min="0" step="10" required />';
				if (hours > 0) {
					html += '<small class="form-help">Estimert ' + hours + ' timer total varighet.</small>';
				}
				html += '</div>';
				html += '<div class="field half"><label for="bud-totalpris">Totalpris (NOK)</label><input type="number" id="bud-totalpris" name="totalpris" min="0" step="10" required /><small class="form-help">Auto-beregnet, kan overstyres.</small></div>';
				html += '<div class="field"><label for="bud-begrunnelse">Begrunnelse</label><textarea id="bud-begrunnelse" name="begrunnelse" rows="4" required maxlength="1500" placeholder="Hva gjør deres tilbud unikt?"></textarea></div>';
				html += '<div class="field half"><label for="bud-kontaktnavn">Kontaktperson</label><input type="text" id="bud-kontaktnavn" name="kontaktNavn" required /></div>';
				html += '<div class="field half"><label for="bud-kontaktepost">E-post</label><input type="email" id="bud-kontaktepost" name="kontaktEpost" required value="' + Util.escapeHtml(session.epost || '') + '" /></div>';
				html += '<div class="field half"><label for="bud-kontakttelefon">Telefon (valgfritt)</label><input type="tel" id="bud-kontakttelefon" name="kontaktTelefon" /></div>';
				html += '</div>';
				html += '<div class="form-error" id="bud-form-error" hidden></div>';
				html += '<div class="form-actions">';
				html += '<button type="submit" class="button primary">Send anbud</button>';
				html += '<a href="#vekter" class="button">Avbryt</a>';
				html += '</div>';
				html += '</form>';
			}

			html += '</div>';
			container.innerHTML = html;
		}
	};

	/* ============================================================
	   Forms (event delegation + handlers)
	   ============================================================ */

	var Forms = {

		bindAll: function () {
			// Rolle-skjema: kunde
			var formKunde = Util.byId('form-role-kunde');
			if (formKunde) {
				// Spor hvilken knapp som ble klikket — submit-event vet det ikke selv
				var lastKundeMode = 'login';
				var kundeButtons = formKunde.querySelectorAll('button[data-mode]');
				for (var i = 0; i < kundeButtons.length; i++) {
					(function (btn) {
						btn.addEventListener('click', function () {
							lastKundeMode = btn.getAttribute('data-mode') || 'login';
						});
					})(kundeButtons[i]);
				}
				formKunde.addEventListener('submit', function (e) {
					e.preventDefault();
					Forms.handleRoleKunde(lastKundeMode);
					lastKundeMode = 'login';
				});
			}

			// Rolle-skjema: vekter
			var formVekter = Util.byId('form-role-vekter');
			if (formVekter) {
				var lastVekterMode = 'login';
				var vekterButtons = formVekter.querySelectorAll('button[data-mode]');
				for (var j = 0; j < vekterButtons.length; j++) {
					(function (btn) {
						btn.addEventListener('click', function () {
							lastVekterMode = btn.getAttribute('data-mode') || 'login';
						});
					})(vekterButtons[j]);
				}
				formVekter.addEventListener('submit', function (e) {
					e.preventDefault();
					Forms.handleRoleVekter(lastVekterMode);
					lastVekterMode = 'login';
				});
			}

			// Seed demo
			var btnSeed = Util.byId('btn-seed-demo');
			if (btnSeed) {
				btnSeed.addEventListener('click', function (e) {
					e.preventDefault();
					Forms.handleSeedDemo();
				});
			}

			// Nytt oppdrag-skjema (statisk i HTML)
			var formOppdrag = Util.byId('form-nytt-oppdrag');
			if (formOppdrag) {
				formOppdrag.addEventListener('submit', function (e) {
					e.preventDefault();
					Forms.handleNyttOppdrag();
				});
			}

			// Tabs (vekter)
			var tabsContainer = document.querySelector('.portal-tabs');
			if (tabsContainer) {
				tabsContainer.addEventListener('click', function (e) {
					var tab = e.target.closest('.portal-tab');
					if (tab) {
						Views._setActiveTab(tab.getAttribute('data-tab'));
					}
				});
			}

			// Privat / Bedrift toggle
			var kundeTypeRadios = document.querySelectorAll('input[name="kundeType"]');
			for (var i = 0; i < kundeTypeRadios.length; i++) {
				kundeTypeRadios[i].addEventListener('change', Forms.handleKundeTypeToggle);
			}
			Forms.handleKundeTypeToggle();

			// Document-level delegation for dynamisk genererte knapper og bud-skjema
			document.addEventListener('click', Forms.handleDelegatedClick);
			document.addEventListener('submit', Forms.handleDelegatedSubmit);
			document.addEventListener('input', Forms.handleDelegatedInput);
		},

		handleDelegatedClick: function (e) {
			var btn = e.target.closest('[data-action]');
			if (!btn) return;
			var action = btn.getAttribute('data-action');
			if (action === 'cancel-oppdrag') {
				Forms.handleCancelOppdrag(btn.getAttribute('data-id'));
			} else if (action === 'complete-oppdrag') {
				Forms.handleCompleteOppdrag(btn.getAttribute('data-id'));
			} else if (action === 'accept-bud') {
				Forms.handleAcceptBud(btn.getAttribute('data-bud'), btn.getAttribute('data-oppdrag'));
			} else if (action === 'reject-bud') {
				Forms.handleRejectBud(btn.getAttribute('data-bud'));
			} else if (action === 'withdraw-bud') {
				Forms.handleWithdrawBud(btn.getAttribute('data-bud'));
			}
		},

		handleDelegatedSubmit: function (e) {
			if (e.target.id === 'form-nytt-bud') {
				e.preventDefault();
				Forms.handleNyttBud(e.target);
			}
		},

		handleDelegatedInput: function (e) {
			// Auto-beregn totalpris fra timepris × hours i bud-skjema
			if (e.target.id === 'bud-timepris') {
				var form = e.target.closest('form');
				if (!form) return;
				var hours = Number(form.getAttribute('data-hours')) || 0;
				var timepris = Number(e.target.value) || 0;
				var total = Util.byId('bud-totalpris');
				if (total && hours > 0) {
					total.value = Math.round(timepris * hours);
				}
			}
		},

		handleRoleKunde: function (mode) {
			mode = mode === 'register' ? 'register' : 'login';
			var errEl = Util.byId('kunde-form-error');
			errEl.hidden = true;

			var kundeTypeEl = document.querySelector('input[name="kundeType"]:checked');
			var kundeType = kundeTypeEl ? kundeTypeEl.value : 'privat';
			var brukernavn = Util.byId('kunde-brukernavn').value.trim();
			var passord = Util.byId('kunde-passord').value;

			if (!brukernavn || !passord) {
				errEl.textContent = 'Fyll inn brukernavn og passord.';
				errEl.hidden = false;
				return;
			}
			if (passord.length < 4) {
				errEl.textContent = 'Passord må være minst 4 tegn.';
				errEl.hidden = false;
				return;
			}

			var passordHash = Util.hash(passord);
			var existing = Storage.findUser('kunde', brukernavn);

			if (mode === 'login') {
				// Innlogging — krever eksisterende konto
				if (!existing) {
					errEl.textContent = 'Brukernavnet finnes ikke. Trykk Registrer for å opprette ny konto.';
					errEl.hidden = false;
					return;
				}
				if (existing.passordHash !== passordHash) {
					errEl.textContent = 'Feil passord.';
					errEl.hidden = false;
					return;
				}
				if (existing.kundeType !== kundeType) {
					errEl.textContent = 'Brukernavnet finnes allerede som ' + (existing.kundeType === 'privat' ? 'privatkunde' : 'bedriftskunde') + '. Velg riktig kundetype og prøv igjen.';
					errEl.hidden = false;
					return;
				}
				// OK — bygg session
			} else {
				// Registrering — krever ledig brukernavn og evt. bedrift-felt
				if (existing) {
					errEl.textContent = 'Brukernavnet er allerede tatt. Velg et annet eller trykk Logg inn.';
					errEl.hidden = false;
					return;
				}
				var orgnr = '', epost = '', telefon = '';
				if (kundeType === 'bedrift') {
					orgnr = Util.byId('kunde-orgnr').value.trim();
					epost = Util.byId('kunde-epost').value.trim();
					telefon = Util.byId('kunde-telefon').value.trim();
					if (!orgnr || !epost || !telefon) {
						errEl.textContent = 'Bedrifter må fylle inn organisasjonsnummer, e-post og telefon.';
						errEl.hidden = false;
						return;
					}
					if (!Util.validEmail(epost)) {
						errEl.textContent = 'Skriv en gyldig e-postadresse.';
						errEl.hidden = false;
						return;
					}
				}
				var newUser = {
					rolle: 'kunde',
					brukernavn: brukernavn.toLowerCase().trim(),
					passordHash: passordHash,
					kundeType: kundeType,
					customerId: 'kunde-' + Util.hash('kunde|' + brukernavn.toLowerCase().trim()),
					orgNr: orgnr,
					epost: epost,
					telefon: telefon,
					createdAt: new Date().toISOString()
				};
				Storage.saveUser(newUser);
				existing = newUser;
				Flash.show('Konto opprettet. Du er nå logget inn.', 'info');
			}

			var displayName = existing.kundeType === 'bedrift' ? existing.brukernavn : 'Privat: ' + existing.brukernavn;

			var session = {
				role: 'kunde',
				kundeType: existing.kundeType,
				brukernavn: existing.brukernavn,
				customerId: existing.customerId,
				customerName: displayName,
				epost: existing.epost || '',
				telefon: existing.telefon || '',
				orgNr: existing.orgNr || '',
				createdAt: new Date().toISOString()
			};
			Storage.setSession(session);
			Views.renderSessionChip();
			location.hash = '#kunde';
		},

		handleRoleVekter: function (mode) {
			mode = mode === 'register' ? 'register' : 'login';
			var errEl = Util.byId('vekter-form-error');
			errEl.hidden = true;

			var firma = Util.byId('vekter-firma').value.trim();
			var brukernavn = Util.byId('vekter-brukernavn').value.trim();
			var passord = Util.byId('vekter-passord').value;

			if (!brukernavn || !passord) {
				errEl.textContent = 'Fyll inn brukernavn og passord.';
				errEl.hidden = false;
				return;
			}
			if (passord.length < 4) {
				errEl.textContent = 'Passord må være minst 4 tegn.';
				errEl.hidden = false;
				return;
			}

			var passordHash = Util.hash(passord);
			var existing = Storage.findUser('vekter', brukernavn);

			if (mode === 'login') {
				if (!existing) {
					errEl.textContent = 'Brukernavnet finnes ikke. Trykk Registrer for å opprette ny konto.';
					errEl.hidden = false;
					return;
				}
				if (existing.passordHash !== passordHash) {
					errEl.textContent = 'Feil passord.';
					errEl.hidden = false;
					return;
				}
				// Hvis bruker fylte inn nytt firmanavn, oppdater (valgfritt)
				if (firma && existing.guardCompanyName !== firma) {
					Storage.updateUser('vekter', brukernavn, { guardCompanyName: firma });
					existing.guardCompanyName = firma;
				}
			} else {
				if (existing) {
					errEl.textContent = 'Brukernavnet er allerede tatt. Velg et annet eller trykk Logg inn.';
					errEl.hidden = false;
					return;
				}
				if (!firma) {
					errEl.textContent = 'Fyll inn vekterselskap-navnet for å registrere.';
					errEl.hidden = false;
					return;
				}
				var newUser = {
					rolle: 'vekter',
					brukernavn: brukernavn.toLowerCase().trim(),
					passordHash: passordHash,
					guardCompanyId: 'vakt-' + Util.hash('vakt|' + brukernavn.toLowerCase().trim()),
					guardCompanyName: firma,
					createdAt: new Date().toISOString()
				};
				Storage.saveUser(newUser);
				existing = newUser;
				Flash.show('Vekter-konto opprettet. Du er nå logget inn.', 'info');
			}

			var session = {
				role: 'vekter',
				brukernavn: existing.brukernavn,
				guardCompanyId: existing.guardCompanyId,
				guardCompanyName: existing.guardCompanyName,
				guardOrgNr: existing.guardOrgNr || '',
				epost: existing.epost || '',
				createdAt: new Date().toISOString()
			};
			Storage.setSession(session);
			Views.renderSessionChip();
			location.hash = '#vekter';
		},

		handleKundeTypeToggle: function () {
			var checked = document.querySelector('input[name="kundeType"]:checked');
			var type = checked ? checked.value : 'privat';
			var bedriftFields = document.querySelectorAll('[data-kundetype="bedrift"]');
			for (var i = 0; i < bedriftFields.length; i++) {
				bedriftFields[i].hidden = (type !== 'bedrift');
			}
		},

		handleSeedDemo: function () {
			// Lager eksempel-bedriftsbruker + ett apent oppdrag.
			var demoBrukernavn = 'bunnpris-storo';
			var demoPassord = 'demo1234';
			var customerId = 'kunde-' + Util.hash('kunde|' + demoBrukernavn);

			// Opprett bruker hvis den ikke finnes
			if (!Storage.findUser('kunde', demoBrukernavn)) {
				Storage.saveUser({
					rolle: 'kunde',
					brukernavn: demoBrukernavn,
					passordHash: Util.hash(demoPassord),
					kundeType: 'bedrift',
					customerId: customerId,
					orgNr: '950470919',
					epost: 'demo@bunnpris-storo.no',
					telefon: '+47 98 76 54 32',
					createdAt: new Date().toISOString()
				});
			}

			var existing = Storage.listOppdrag().find(function (o) { return o.customerId === customerId; });
			if (existing) {
				Flash.show('Demo-data finnes allerede. Logg inn som Bedrift med brukernavn "' + demoBrukernavn + '" og passord "' + demoPassord + '".', 'info');
				return;
			}
			var now = new Date();
			var nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
			var dato = nextWeek.toISOString().slice(0, 10);
			var oppdrag = {
				id: Util.uid('opp'),
				customerId: customerId,
				customerName: demoBrukernavn,
				kontaktEpost: 'demo@bunnpris-storo.no',
				kontaktTelefon: '+47 98 76 54 32',
				tittel: 'Stasjonær vekter — kveldsvakt 16-24',
				type: 'stasjonaer',
				beskrivelse: 'Vi trenger en uniformert vekter til kveldsvakt i butikken vår på Storo. Vi forventer høyt kundetrykk og ønsker en vekter med erfaring fra detaljhandel.',
				adresse: 'Vitaminveien 7, 0485 Oslo',
				startDato: dato,
				sluttDato: dato,
				startTid: '16:00',
				sluttTid: '23:59',
				antallVektere: 1,
				krav: { uniformert: true, sertifisert: true, hund: false, kjoretoy: false, forstehjelp: true },
				sprak: ['nb'],
				budsjettMaks: 700,
				valuta: 'NOK',
				notat: 'Demo-oppdrag fra "Last inn demo-data".',
				status: 'apen',
				awardedBidId: null,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			};
			Storage.saveOppdrag(oppdrag);
			Flash.show('Demo-data lastet inn. Logg inn som Bedrift: brukernavn "' + demoBrukernavn + '", passord "' + demoPassord + '".', 'info');
		},

		handleNyttOppdrag: function () {
			var session = Storage.getSession();
			if (!session || session.role !== 'kunde') {
				Flash.show('Du må være logget inn som kunde.', 'error');
				return;
			}
			var errEl = Util.byId('ny-oppdrag-error');
			errEl.hidden = true;

			var tittel = Util.byId('opp-tittel').value.trim();
			var type = Util.byId('opp-type').value;
			var beskrivelse = Util.byId('opp-beskrivelse').value.trim();
			var adresse = Util.byId('opp-adresse').value.trim();
			var startDato = Util.byId('opp-startdato').value;
			var sluttDato = Util.byId('opp-sluttdato').value;
			var startTid = Util.byId('opp-starttid').value;
			var sluttTid = Util.byId('opp-sluttid').value;
			var antallVektere = parseInt(Util.byId('opp-antall').value, 10);
			var budsjett = Util.byId('opp-budsjett').value;
			var notat = Util.byId('opp-notat').value.trim();

			if (!tittel || !beskrivelse || !adresse || !startDato || !sluttDato || !startTid || !sluttTid || !antallVektere) {
				errEl.textContent = 'Alle obligatoriske felt må fylles ut.';
				errEl.hidden = false;
				return;
			}
			if (sluttDato < startDato) {
				errEl.textContent = 'Sluttdato må være lik eller etter startdato.';
				errEl.hidden = false;
				return;
			}
			if (startDato === sluttDato && sluttTid <= startTid) {
				errEl.textContent = 'Sluttid må være etter starttid når oppdraget er på samme dag.';
				errEl.hidden = false;
				return;
			}
			if (antallVektere < 1) {
				errEl.textContent = 'Minst én vekter må etterspørres.';
				errEl.hidden = false;
				return;
			}

			var krav = {
				uniformert: !!document.querySelector('[name="krav-uniformert"]:checked'),
				sertifisert: !!document.querySelector('[name="krav-sertifisert"]:checked'),
				hund: !!document.querySelector('[name="krav-hund"]:checked'),
				kjoretoy: !!document.querySelector('[name="krav-kjoretoy"]:checked'),
				forstehjelp: !!document.querySelector('[name="krav-forstehjelp"]:checked')
			};
			var sprak = [];
			if (document.querySelector('[name="sprak-nb"]:checked')) sprak.push('nb');
			if (document.querySelector('[name="sprak-en"]:checked')) sprak.push('en');

			var oppdrag = {
				id: Util.uid('opp'),
				customerId: session.customerId,
				customerName: session.customerName,
				kontaktEpost: session.epost || '',
				kontaktTelefon: session.telefon || '',
				tittel: tittel,
				type: type,
				beskrivelse: beskrivelse,
				adresse: adresse,
				startDato: startDato,
				sluttDato: sluttDato,
				startTid: startTid,
				sluttTid: sluttTid,
				antallVektere: antallVektere,
				krav: krav,
				sprak: sprak,
				budsjettMaks: budsjett ? Number(budsjett) : null,
				valuta: 'NOK',
				notat: notat,
				status: 'apen',
				awardedBidId: null,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			};
			Storage.saveOppdrag(oppdrag);
			Flash.show('Oppdraget er publisert.', 'info');
			location.hash = '#kunde/oppdrag/' + oppdrag.id;
		},

		handleNyttBud: function (form) {
			var session = Storage.getSession();
			if (!session || session.role !== 'vekter') {
				Flash.show('Du må være logget inn som vekter.', 'error');
				return;
			}
			var oppdragId = form.getAttribute('data-oppdrag');
			var oppdrag = Storage.getOppdrag(oppdragId);
			var errEl = Util.byId('bud-form-error');
			errEl.hidden = true;

			if (!oppdrag || oppdrag.status !== 'apen') {
				errEl.textContent = 'Dette oppdraget er ikke lenger åpent.';
				errEl.hidden = false;
				return;
			}

			var timepris = Number(Util.byId('bud-timepris').value);
			var totalpris = Number(Util.byId('bud-totalpris').value);
			var begrunnelse = Util.byId('bud-begrunnelse').value.trim();
			var kontaktNavn = Util.byId('bud-kontaktnavn').value.trim();
			var kontaktEpost = Util.byId('bud-kontaktepost').value.trim();
			var kontaktTelefon = Util.byId('bud-kontakttelefon').value.trim();

			if (!timepris || !totalpris || !begrunnelse || !kontaktNavn || !kontaktEpost) {
				errEl.textContent = 'Alle obligatoriske felt må fylles ut.';
				errEl.hidden = false;
				return;
			}
			if (timepris <= 0 || totalpris <= 0) {
				errEl.textContent = 'Pris må være større enn 0.';
				errEl.hidden = false;
				return;
			}
			if (!Util.validEmail(kontaktEpost)) {
				errEl.textContent = 'Skriv en gyldig kontakt-e-post.';
				errEl.hidden = false;
				return;
			}

			// Hvis vekter har trukket bud tidligere, oppdater eksisterende rad i stedet for ny rad.
			var existing = Storage.findBud(oppdragId, session.guardCompanyId);
			if (existing && existing.status === 'trukket') {
				Storage.updateBud(existing.id, {
					timepris: timepris,
					totalpris: totalpris,
					begrunnelse: begrunnelse,
					kontaktNavn: kontaktNavn,
					kontaktEpost: kontaktEpost,
					kontaktTelefon: kontaktTelefon,
					status: 'innsendt'
				});
			} else if (existing) {
				errEl.textContent = 'Du har allerede sendt inn et bud på dette oppdraget.';
				errEl.hidden = false;
				return;
			} else {
				var bud = {
					id: Util.uid('bud'),
					oppdragId: oppdragId,
					guardCompanyId: session.guardCompanyId,
					guardCompanyName: session.guardCompanyName,
					guardOrgNr: session.guardOrgNr || '',
					timepris: timepris,
					totalpris: totalpris,
					valuta: 'NOK',
					begrunnelse: begrunnelse,
					kontaktNavn: kontaktNavn,
					kontaktEpost: kontaktEpost,
					kontaktTelefon: kontaktTelefon,
					status: 'innsendt',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString()
				};
				Storage.saveBud(bud);
			}

			Flash.show('Bud sendt.', 'info');
			location.hash = '#vekter';
		},

		handleAcceptBud: function (budId, oppdragId) {
			if (!confirm('Aksepter dette budet? Andre bud på oppdraget vil bli avslått.')) return;
			Storage.updateBud(budId, { status: 'akseptert' });
			Storage.updateBudWhere(function (b) {
				return b.oppdragId === oppdragId && b.id !== budId && b.status === 'innsendt';
			}, { status: 'avslatt' });
			Storage.updateOppdrag(oppdragId, { status: 'tildelt', awardedBidId: budId });
			Flash.show('Bud akseptert. Vekteren har nå tilgang til kontaktinfo.', 'info');
			PortalRouter.handle();
		},

		handleRejectBud: function (budId) {
			if (!confirm('Avslå dette budet?')) return;
			Storage.updateBud(budId, { status: 'avslatt' });
			Flash.show('Bud avslått.', 'info');
			PortalRouter.handle();
		},

		handleWithdrawBud: function (budId) {
			if (!confirm('Trekke ditt bud?')) return;
			Storage.updateBud(budId, { status: 'trukket' });
			Flash.show('Bud trukket.', 'info');
			PortalRouter.handle();
		},

		handleCancelOppdrag: function (oppdragId) {
			if (!confirm('Kansellere dette oppdraget? Alle åpne bud blir trukket.')) return;
			Storage.updateOppdrag(oppdragId, { status: 'kansellert' });
			Storage.updateBudWhere(function (b) {
				return b.oppdragId === oppdragId && b.status === 'innsendt';
			}, { status: 'trukket' });
			Flash.show('Oppdrag kansellert.', 'info');
			PortalRouter.handle();
		},

		handleCompleteOppdrag: function (oppdragId) {
			if (!confirm('Markere dette oppdraget som fullført?')) return;
			Storage.updateOppdrag(oppdragId, { status: 'fullfort' });
			Flash.show('Oppdrag markert som fullført.', 'info');
			PortalRouter.handle();
		}
	};

	/* ============================================================
	   Router
	   ============================================================ */

	var PortalRouter = {

		init: function () {
			window.addEventListener('hashchange', PortalRouter.handle);
			PortalRouter.handle();
		},

		parse: function () {
			var hash = (location.hash || '').replace(/^#\/?/, '');
			if (!hash) return { name: 'landing' };
			var parts = hash.split('/');
			// Normalize trailing slash
			parts = parts.filter(function (p) { return p.length > 0; });
			if (parts.length === 0) return { name: 'landing' };

			if (parts[0] === 'bytt-rolle') return { name: 'bytt-rolle' };
			if (parts[0] === 'vekter-login') return { name: 'vekter-login' };
			if (parts[0] === 'kunde') {
				if (parts.length === 1) return { name: 'kunde' };
				if (parts[1] === 'ny') return { name: 'kunde-ny' };
				if (parts[1] === 'oppdrag' && parts[2]) return { name: 'kunde-oppdrag', id: parts[2] };
			}
			if (parts[0] === 'vekter') {
				if (parts.length === 1) return { name: 'vekter' };
				if (parts[1] === 'oppdrag' && parts[2]) return { name: 'vekter-oppdrag', id: parts[2] };
			}
			return { name: 'landing' };
		},

		handle: function () {
			var route = PortalRouter.parse();
			var session = Storage.getSession();

			Views.renderSessionChip();

			if (route.name === 'bytt-rolle') {
				Storage.clearSession();
				Views.renderSessionChip();
				location.hash = '';
				return;
			}

			if (route.name === 'landing') {
				Views.renderLanding();
				return;
			}

			if (route.name === 'vekter-login') {
				// Hvis allerede logget inn som vekter, hopp rett til dashboardet
				if (session && session.role === 'vekter') {
					location.hash = '#vekter';
					return;
				}
				Views.renderVekterLogin();
				return;
			}

			// Routes with required role
			var requiredRole = null;
			if (route.name.indexOf('kunde') === 0) requiredRole = 'kunde';
			else if (route.name.indexOf('vekter') === 0) requiredRole = 'vekter';

			if (requiredRole && (!session || session.role !== requiredRole)) {
				Flash.show('Velg rolle for å fortsette.', 'warn');
				location.hash = '';
				return;
			}

			switch (route.name) {
				case 'kunde':
					Views.renderKundeDashboard();
					break;
				case 'kunde-ny':
					Views.renderKundeNyForm();
					break;
				case 'kunde-oppdrag':
					Views.renderKundeOppdragDetail(route.id);
					break;
				case 'vekter':
					Views.renderVekterDashboard();
					break;
				case 'vekter-oppdrag':
					Views.renderVekterOppdragDetail(route.id);
					break;
				default:
					Views.renderLanding();
			}
		}
	};

	/* ============================================================
	   Bootstrap
	   ============================================================ */

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', start);
	} else {
		start();
	}

	function start() {
		Storage.ensureSchema();
		Forms.bindAll();
		PortalRouter.init();
	}

	// Eksponer for debugging i konsollen
	window.__portal = { Storage: Storage, Util: Util, Views: Views, Router: PortalRouter, KEYS: KEYS };

})();
