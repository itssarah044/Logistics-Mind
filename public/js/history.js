/* history.js — Load and display shipment history */

var historyStatus    = document.getElementById('historyStatus');
var historyTableBody = document.getElementById('historyTableBody');

function loadHistory() {
  fetch('/api/decisions')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (!data.success || !data.data || data.data.length === 0) {
        historyStatus.innerText = 'No shipment records found.';
        return;
      }
      historyStatus.innerText = data.data.length + ' record(s) found.';
      renderTable(data.data);
    })
    .catch(function () {
      historyStatus.innerText = 'Could not load records. Make sure the backend is running.';
    });
}

function renderTable(records) {
  while (historyTableBody.firstChild) {
    historyTableBody.removeChild(historyTableBody.firstChild);
  }

  for (var i = 0; i < records.length; i++) {
    var r   = records[i];
    var row = document.createElement('tr');

    var cells = [
      r.id,
      r.shipment_type,
      r.weight,
      r.origin,
      r.destination,
      r.delivery_date ? r.delivery_date.toString().substring(0, 10) : '—',
      r.budget || '—',
      r.shipping_method,
      r.selected_route,
      r.distance_km,
      r.duration_hr,
      r.cost_level,
      r.traffic_level,
      r.risk_level,
      r.created_at ? r.created_at.toString().substring(0, 19) : '—'
    ];

    for (var j = 0; j < cells.length; j++) {
      var td = document.createElement('td');
      td.innerText = cells[j] !== null && cells[j] !== undefined ? cells[j] : '—';
      row.appendChild(td);
    }

    historyTableBody.appendChild(row);
  }
}

loadHistory();