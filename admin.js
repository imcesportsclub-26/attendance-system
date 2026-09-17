import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const $ = id => document.getElementById(id);

const message = $('adminMessage');
const eventSelect = $('eventSelect');
const tbody = $('attendanceBody');

let supabase = null;
let events = [];
let rows = [];
let selected = null;
let editingAttendance = null;

const ready =
  SUPABASE_URL &&
  !SUPABASE_URL.includes('YOUR_') &&
  SUPABASE_ANON_KEY &&
  !SUPABASE_ANON_KEY.includes('YOUR_');

function msg(t = '', type = 'info') {
  message.className = t ? `message ${type}` : 'message';
  message.textContent = t;
}

if (!ready) {
  msg('Setup required: configure Supabase in config.js.', 'error');
} else {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    location.replace('login.html');
  } else {
    const { data: ok } = await supabase.rpc('is_super_admin');

    if (!ok) {
      await supabase.auth.signOut();
      location.replace('login.html?denied=1');
    } else {
      loadAll();
    }
  }
}

async function loadAll() {
  msg('Loading…');

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('event_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    msg(error.message, 'error');
    return;
  }

  events = data || [];

  $('eventCount').textContent = events.length;

  renderSelect();

  msg('');

  if (events.length) {
    await choose(eventSelect.value);
  } else {
    selected = null;

    tbody.innerHTML =
      '<tr class="empty-row"><td colspan="5">Create your first event above.</td></tr>';

    renderQR();
    closeEditPanel();
  }
}

function renderSelect() {
  const prev = selected?.id;

  eventSelect.innerHTML = events.length
    ? events
        .map(
          e =>
            `<option value="${e.id}">${esc(e.event_date)} · ${esc(e.name)}</option>`
        )
        .join('')
    : '<option>No events yet</option>';

  if (prev && events.some(e => e.id === prev)) {
    eventSelect.value = prev;
  }
}

async function choose(id) {
  selected = events.find(e => e.id === id) || events[0];

  if (!selected) return;

  eventSelect.value = selected.id;

  renderQR();

  const { data, error } = await supabase
    .from('attendance')
    .select('id,student_name,batch_intake,team_name,checked_in_at')
    .eq('event_id', selected.id)
    .order('checked_in_at', { ascending: false })
    .limit(5000);

  if (error) {
    msg(error.message, 'error');
    return;
  }

  rows = data || [];

  renderRows();
}

function renderRows() {
  const q = $('searchInput').value.trim().toLowerCase();

  const f = rows.filter(r =>
    `${r.student_name} ${r.batch_intake} ${r.team_name}`
      .toLowerCase()
      .includes(q)
  );

  $('totalCount').textContent = rows.length;

  tbody.innerHTML = f.length
    ? f.map((r, i) => `
        <tr>
          <td>${i + 1}</td>

          <td>${esc(r.student_name)}</td>

          <td>${esc(r.batch_intake)}</td>

          <td>${esc(r.team_name || '—')}</td>

          <td>${new Date(r.checked_in_at).toLocaleString()}</td>

          <td>
            <div class="row-actions">
              <button
                type="button"
                class="table-edit-btn"
                data-id="${r.id}">
                Edit
              </button>

              <button
                type="button"
                class="table-delete-btn"
                data-id="${r.id}">
                Delete
              </button>
            </div>
          </td>
        </tr>
      `).join('')
    : `
        <tr class="empty-row">
          <td colspan="6">No attendance records found.</td>
        </tr>
      `;
}

tbody.addEventListener('click', async (e) => {
  const deleteButton = e.target.closest('.table-delete-btn');

  if (!deleteButton) return;

  const id = deleteButton.dataset.id;
  const record = rows.find(r => String(r.id) === String(id));

  if (!record) {
    msg('Attendance record not found.', 'error');
    return;
  }

  const confirmed = confirm(
    `Delete attendance for "${record.student_name}"?\n\n` +
    `Batch / Intake: ${record.batch_intake}\n` +
    `Team: ${record.team_name || '—'}\n\n` +
    `This action cannot be undone.`
  );

  if (!confirmed) return;

  deleteButton.disabled = true;
  deleteButton.textContent = 'Deleting...';

  const { error } = await supabase
    .from('attendance')
    .delete()
    .eq('id', record.id);

  if (error) {
    console.error(error);
    deleteButton.disabled = false;
    deleteButton.textContent = 'Delete';
    msg(`Delete failed: ${error.message}`, 'error');
    return;
  }

  rows = rows.filter(r => String(r.id) !== String(record.id));

  renderRows();

  msg(
    `Attendance deleted successfully: ${record.student_name}`,
    'success'
  );
});

function renderQR() {
  const holder = $('qrCode');

  holder.innerHTML = '';

  if (!selected) {
    $('qrUrl').textContent = '';
    $('eventStatus').textContent = 'No event selected';
    return;
  }

  const url = new URL('./', location.href);
  url.searchParams.set('event', selected.slug);

  $('qrUrl').textContent = url.href;

  new QRCode(holder, {
    text: url.href,
    width: 180,
    height: 180,
    correctLevel: QRCode.CorrectLevel.H
  });

  const now = new Date();

  const open =
    selected.is_open &&
    (!selected.opens_at || now >= new Date(selected.opens_at)) &&
    (!selected.closes_at || now <= new Date(selected.closes_at));

  $('eventStatus').textContent =
    `${selected.event_type} · ${selected.event_date} · ${
      open ? 'CHECK-IN OPEN' : 'CHECK-IN CLOSED'
    }`;

  $('toggleEventButton').textContent =
    selected.is_open ? 'Close Check-In' : 'Open Check-In';
}

$('deleteEventButton').addEventListener('click', async () => {
  if (!selected) return;

  const eventName = selected.name;
  const attendanceCount = rows.length;

  const confirmed = confirm(
    `Delete "${eventName}"?\n\n` +
    `This will permanently delete this event and ${attendanceCount} attendance record(s).\n\n` +
    `This action cannot be undone.`
  );

  if (!confirmed) return;

  const secondConfirmed = confirm(
    `FINAL CONFIRMATION\n\n` +
    `Are you sure you want to permanently delete "${eventName}"?`
  );

  if (!secondConfirmed) return;

  msg('Deleting event…', 'info');

  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', selected.id);

  if (error) {
    msg(`Delete failed: ${error.message}`, 'error');
    return;
  }

  selected = null;
  rows = [];

  msg(`Event deleted successfully: ${eventName}`, 'success');

  await loadAll();
});


/* =========================
   CREATE EVENT
========================= */

$('eventForm').addEventListener('submit', async e => {
  e.preventDefault();

  const name = $('newEventName').value.trim();
  const type = $('newEventType').value;
  const date = $('newEventDate').value;
  const opens = $('newOpensAt').value;
  const closes = $('newClosesAt').value;

  if (opens && closes && new Date(closes) <= new Date(opens)) {
    msg('Close time must be after open time.', 'error');
    return;
  }

  const slug =
    `${slugify(name)}-${date.replaceAll('-', '')}-${Math.random()
      .toString(36)
      .slice(2, 6)}`.slice(0, 80);

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const payload = {
    name,
    slug,
    event_type: type,
    event_date: date,
    opens_at: opens ? new Date(opens).toISOString() : null,
    closes_at: closes ? new Date(closes).toISOString() : null,
    require_team: $('newRequireTeam').checked,
    is_open: true,
    note: $('newNote').value.trim() || null,
    created_by: user.id
  };

  const { data, error } = await supabase
    .from('events')
    .insert(payload)
    .select()
    .single();

  if (error) {
    msg(error.message, 'error');
    return;
  }

  msg('Event created. Its unique QR is ready.', 'success');

  $('eventForm').reset();
  $('newEventDate').value = today();
  $('newRequireTeam').checked = type !== 'Meeting';

  selected = data;

  await loadAll();

  eventSelect.value = data.id;

  await choose(data.id);
});


/* =========================
   EDIT EVENT
========================= */

$('editEventButton').addEventListener('click', () => {
  if (!selected) {
    msg('Select an event first.', 'info');
    return;
  }

  $('editEventName').value = selected.name || '';
  $('editEventType').value = selected.event_type || 'Other';
  $('editEventDate').value = selected.event_date || '';
  $('editOpensAt').value = toLocalDateTimeInput(selected.opens_at);
  $('editClosesAt').value = toLocalDateTimeInput(selected.closes_at);
  $('editRequireTeam').checked = !!selected.require_team;
  $('editNote').value = selected.note || '';

  $('editEventPanel').hidden = false;

  $('editEventPanel').scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
});

$('cancelEditButton').addEventListener('click', () => {
  closeEditPanel();
  msg('');
});

$('editEventForm').addEventListener('submit', async e => {
  e.preventDefault();

  if (!selected) {
    msg('No event selected.', 'error');
    return;
  }

  const eventId = selected.id;

  const name = $('editEventName').value.trim();
  const type = $('editEventType').value;
  const date = $('editEventDate').value;
  const opens = $('editOpensAt').value;
  const closes = $('editClosesAt').value;

  if (!name || !date) {
    msg('Event name and date are required.', 'error');
    return;
  }

  if (opens && closes && new Date(closes) <= new Date(opens)) {
    msg('Close time must be after open time.', 'error');
    return;
  }

  const payload = {
    name,
    event_type: type,
    event_date: date,
    opens_at: opens ? new Date(opens).toISOString() : null,
    closes_at: closes ? new Date(closes).toISOString() : null,
    require_team: $('editRequireTeam').checked,
    note: $('editNote').value.trim() || null
  };

  const saveButton = $('editEventForm').querySelector(
    'button[type="submit"]'
  );

  saveButton.disabled = true;
  saveButton.textContent = 'Saving…';

  const { data, error } = await supabase
    .from('events')
    .update(payload)
    .eq('id', eventId)
    .select()
    .single();

  saveButton.disabled = false;
  saveButton.textContent = 'Save Changes';

  if (error) {
    msg(error.message, 'error');
    return;
  }

  const index = events.findIndex(e => e.id === eventId);

  if (index !== -1) {
    events[index] = data;
  }

  selected = data;

  renderSelect();

  eventSelect.value = eventId;

  renderQR();

  closeEditPanel();

  msg(`Event updated successfully: ${data.name}`, 'success');
});


/* =========================
   EVENT CONTROLS
========================= */

$('newEventType').addEventListener('change', () => {
  $('newRequireTeam').checked =
    $('newEventType').value !== 'Meeting';
});

$('editEventType').addEventListener('change', () => {
  if ($('editEventType').value === 'Meeting') {
    $('editRequireTeam').checked = false;
  }
});

eventSelect.addEventListener('change', async () => {
  closeEditPanel();
  await choose(eventSelect.value);
});

$('searchInput').addEventListener('input', renderRows);

$('refreshButton').addEventListener('click', async () => {
  closeEditPanel();
  await loadAll();
});

$('logoutButton').addEventListener('click', async () => {
  await supabase.auth.signOut();
  location.replace('login.html');
});


/* =========================
   OPEN / CLOSE CHECK-IN
========================= */

$('toggleEventButton').addEventListener('click', async () => {
  if (!selected) return;

  const { error } = await supabase
    .from('events')
    .update({
      is_open: !selected.is_open
    })
    .eq('id', selected.id);

  if (error) {
    msg(error.message, 'error');
    return;
  }

  selected.is_open = !selected.is_open;

  const i = events.findIndex(e => e.id === selected.id);

  if (i !== -1) {
    events[i] = selected;
  }

  renderQR();

  msg(
    `Check-in ${
      selected.is_open ? 'opened' : 'closed'
    } for ${selected.name}.`,
    'success'
  );
});


/* =========================
   DOWNLOAD QR
========================= */

$('downloadQrButton').addEventListener('click', () => {
  if (!selected) return;

  const holder = $('qrCode');
  const canvas = holder.querySelector('canvas');
  const image = holder.querySelector('img');

  const url = canvas
    ? canvas.toDataURL('image/png')
    : image?.src;

  if (!url) return;

  const a = document.createElement('a');

  a.href = url;
  a.download = `IMC-${slugify(selected.name)}-QR.png`;

  a.click();
});


/* =========================
   CSV EXPORT
========================= */

$('exportButton').addEventListener('click', () => {
  if (!selected || !rows.length) {
    msg('No attendance to export for this event.', 'info');
    return;
  }

  const csv = [
    [
      'Student Name',
      'Batch / Intake',
      'Team Name',
      'Check-in Time'
    ],
    ...rows.map(r => [
      r.student_name,
      r.batch_intake,
      r.team_name,
      new Date(r.checked_in_at).toLocaleString()
    ])
  ]
    .map(row =>
      row
        .map(
          value =>
            `"${String(value ?? '').replaceAll('"', '""')}"`
        )
        .join(',')
    )
    .join('\n');

  const url = URL.createObjectURL(
    new Blob(['\uFEFF' + csv], {
      type: 'text/csv;charset=utf-8'
    })
  );

  const a = document.createElement('a');

  a.href = url;
  a.download =
    `${slugify(selected.name)}-attendance.csv`;

  a.click();

  URL.revokeObjectURL(url);
});


/* =========================
   HELPERS
========================= */

function closeEditPanel() {
  $('editEventPanel').hidden = true;
  $('editEventForm').reset();
}

function toLocalDateTimeInput(value) {
  if (!value) return '';

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    return '';
  }

  const local = new Date(
    d.getTime() - d.getTimezoneOffset() * 60000
  );

  return local.toISOString().slice(0, 16);
}

function esc(v = '') {
  return String(v).replace(
    /[&<>'"]/g,
    c =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      })[c]
  );
}

function slugify(v) {
  return v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'event';
}

function today() {
  const d = new Date();

  return `${d.getFullYear()}-${String(
    d.getMonth() + 1
  ).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

$('newEventDate').value = today();
