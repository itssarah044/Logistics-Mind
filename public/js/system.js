/* system.js — Decision Engine Logic */

// ----- DOM REFS -----
var form           = document.getElementById('decisionForm');
var submitBtn      = document.getElementById('submitBtn');
var submitText     = document.getElementById('submitText');
var submitLoader   = document.getElementById('submitLoader');
var resultsSection = document.getElementById('resultsSection');
var resetBtn       = document.getElementById('resetBtn');
var saveBtn        = document.getElementById('saveBtn');
var saveSection    = document.getElementById('saveSection');
var dbNotice       = document.getElementById('dbNotice');
var routesGrid     = document.getElementById('routesGrid');

// State
var selectedRoute  = null;
var shippingDecisionData = null;
var formSnapshot   = {};

// ----- RESET -----
if (resetBtn) {
  resetBtn.addEventListener('click', function () {
    resultsSection.classList.add('hidden');
    form.reset();
    clearAllErrors();
    selectedRoute  = null;
    shippingDecisionData = null;
    saveSection.classList.add('hidden');
    dbNotice.classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ----- SAVE BUTTON -----
if (saveBtn) {
  saveBtn.addEventListener('click', function () {
    if (!selectedRoute) return;
    setSaveLoading(true);
    var payload = {
      shipmentType:   formSnapshot.shipmentType,
      weight:         formSnapshot.weight,
      origin:         formSnapshot.origin,
      destination:    formSnapshot.destination,
      deliveryDate:   formSnapshot.deliveryDate,
      budget:         formSnapshot.budget || null,
      shippingMethod: shippingDecisionData.method,
      selectedRoute:  selectedRoute.name,
      distanceKm:     selectedRoute.distanceKm,
      durationHr:     selectedRoute.durationHr,
      costLevel:      selectedRoute.costLevel,
      trafficLevel:   selectedRoute.traffic,
      riskLevel:      selectedRoute.risk
    };
    fetch('/api/decisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(function (res) { return res.json(); })
    .then(function () {
      setSaveLoading(false);
      saveSection.classList.add('hidden');
      dbNotice.classList.remove('hidden');
    })
    .catch(function () {
      setSaveLoading(false);
      dbNotice.classList.remove('hidden');
    });
  });
}

// ----- FORM SUBMIT -----
if (form) {
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearAllErrors();
    if (!validateDecisionForm()) return;
    setLoading(true);

    var origin      = document.getElementById('origin').value.trim();
    var destination = document.getElementById('destination').value.trim();

    formSnapshot = {
      shipmentType: document.getElementById('shipmentType').value,
      weight:       parseFloat(document.getElementById('weight').value),
      origin:       origin,
      destination:  destination,
      deliveryDate: document.getElementById('deliveryDate').value,
      budget:       document.getElementById('budget').value
    };

    fetchRoutes(origin, destination)
      .then(function (routes) {
        var avgDistance = routes.length > 0 ? routes[0].distanceKm : 500;
        shippingDecisionData = decideShippingMethod(
          formSnapshot.shipmentType,
          formSnapshot.weight,
          formSnapshot.deliveryDate,
          avgDistance,
          formSnapshot.budget
        );
        displayResults(shippingDecisionData, routes);
        setLoading(false);
      })
      .catch(function (err) {
        console.error(err);
        setLoading(false);
        alert(err.message || 'Route data could not be fetched. Please check the city/country names or API connection.');
      });
  });
}

// ----- SHIPPING METHOD DECISION -----
function decideShippingMethod(type, weight, deliveryDate, distanceKm, budget) {
  var airScore  = 0;
  var seaScore  = 0;
  var landScore = 0;

  var reasons = { air: [], sea: [], land: [] };

  if (type === 'time-sensitive') {
    airScore += 40;
    reasons.air.push('Shipment is time-sensitive, requiring the fastest available method.');
  } else if (type === 'fragile') {
    airScore  += 10;
    landScore += 10;
    reasons.air.push('Fragile shipments benefit from shorter transit exposure.');
    reasons.land.push('Land transport offers controlled handling for fragile cargo over short routes.');
  } else {
    landScore += 10;
    seaScore  += 5;
    reasons.land.push('Standard shipment type is well-suited for land transport.');
  }

  if (weight > 5000) {
    seaScore  += 40;
    airScore  -= 20;
    reasons.sea.push('Weight exceeds 5,000 kg — sea freight is the only practical option for this cargo size.');
  } else if (weight > 500) {
    seaScore  += 25;
    landScore += 10;
    airScore  -= 10;
    reasons.sea.push('Weight exceeds 500 kg, making sea freight more cost-effective than air.');
    reasons.land.push('Land transport is viable for this weight range on regional routes.');
  } else if (weight > 100) {
    landScore += 15;
    seaScore  += 5;
    reasons.land.push('Weight is within the ideal range for land transport.');
  } else {
    airScore  += 10;
    landScore += 10;
    reasons.air.push('Lightweight cargo is efficient to ship by air.');
    reasons.land.push('Lightweight cargo is easy to handle via land transport.');
  }

  if (distanceKm > 3000) {
    seaScore  += 25;
    airScore  += 15;
    landScore -= 20;
    reasons.sea.push('Long distance favors sea or air over land.');
    reasons.air.push('Air freight is viable for long international distances.');
  } else if (distanceKm > 800) {
    landScore += 10;
    seaScore  += 10;
    reasons.land.push('Medium-to-long distance is manageable by land or sea.');
  } else {
    landScore += 20;
    reasons.land.push('Short distance strongly favors land transport for speed and cost.');
  }

  var today    = new Date();
  today.setHours(0, 0, 0, 0);
  var delivery = new Date(deliveryDate);
  var daysLeft = Math.round((delivery - today) / (1000 * 60 * 60 * 24));

  if (daysLeft <= 2) {
    airScore  += 35;
    landScore += 10;
    seaScore  -= 20;
    reasons.air.push('Delivery deadline is within 2 days — only air freight can meet this timeline.');
  } else if (daysLeft <= 7) {
    airScore  += 15;
    landScore += 10;
    reasons.air.push('Tight delivery window of ' + daysLeft + ' days favors faster methods.');
    reasons.land.push('Land transport may meet a ' + daysLeft + '-day deadline for regional routes.');
  } else if (daysLeft <= 21) {
    landScore += 15;
    seaScore  += 10;
    reasons.land.push('Comfortable delivery window allows for standard land transport.');
  } else {
    seaScore  += 20;
    landScore += 10;
    reasons.sea.push('Extended delivery window of ' + daysLeft + ' days allows for slower, cheaper sea freight.');
  }

  var hasBudget = budget && parseFloat(budget) > 0;
  if (hasBudget) {
    var b = parseFloat(budget);
    if (b < 200) {
      landScore += 20;
      seaScore  += 10;
      airScore  -= 15;
      reasons.land.push('Low budget of ' + b + ' SAR favors the most economical option — land transport.');
      reasons.sea.push('Sea freight may fit a tight budget for non-urgent cargo.');
    } else if (b < 1000) {
      landScore += 10;
      reasons.land.push('Moderate budget of ' + b + ' SAR is well-matched to land transport.');
    } else {
      airScore  += 10;
      reasons.air.push('Sufficient budget of ' + b + ' SAR allows for air freight if other factors support it.');
    }
  }

  var scores = [
    { method: 'Air Freight',    icon: 'fa-plane', score: airScore,  reasons: reasons.air  },
    { method: 'Sea Freight',    icon: 'fa-ship',  score: seaScore,  reasons: reasons.sea  },
    { method: 'Land Transport', icon: 'fa-truck', score: landScore, reasons: reasons.land }
  ];

  scores.sort(function (a, b) { return b.score - a.score; });

  var winner = scores[0];
  var reason = winner.reasons.length > 0
    ? winner.reasons.join(' ')
    : 'Based on all shipment parameters, this is the most suitable method.';

  return { method: winner.method, icon: winner.icon, reason: reason, scores: scores };
}

// ----- FETCH ROUTES FROM LOCAL BACKEND -----
function fetchRoutes(origin, destination) {
  return fetch('/api/routes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: origin,
      destination: destination
    })
  })
    .then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Route data could not be fetched.');
        }
        return data;
      });
    })
    .then(function (data) {
      if (!data.routes || data.routes.length < 2) {
        throw new Error('Two different real routes could not be found for these places.');
      }

      formSnapshot.origin = data.origin && data.origin.label ? data.origin.label : formSnapshot.origin;
      formSnapshot.destination = data.destination && data.destination.label ? data.destination.label : formSnapshot.destination;

      return [
        buildRouteObject(
          data.routes[0].name,
          data.routes[0].distanceKm,
          data.routes[0].durationHr,
          data.routes[0].geometry,
          data.originCoords,
          data.destCoords,
          formSnapshot.origin,
          formSnapshot.destination
        ),
        buildRouteObject(
          data.routes[1].name,
          data.routes[1].distanceKm,
          data.routes[1].durationHr,
          data.routes[1].geometry,
          data.originCoords,
          data.destCoords,
          formSnapshot.origin,
          formSnapshot.destination
        )
      ];
    });
}

function buildRouteObject(name, distanceKm, durationHr, geometry, originCoords, destCoords, originLabel, destLabel) {
  var costLevel;
  if (distanceKm < 100)      costLevel = 'Low';
  else if (distanceKm < 500) costLevel = 'Medium';
  else                       costLevel = 'High';

  var traffic;
  if (durationHr < 2)        traffic = 'Low';
  else if (durationHr < 5)   traffic = 'Medium';
  else                       traffic = 'High';

  var risk;
  var riskLabel;

  if (durationHr > 10 && distanceKm > 1000) {
    risk      = 'High';
    riskLabel = 'Very Long Route — High Delay Risk';
  } else if (durationHr > 8 || distanceKm > 800) {
    risk      = 'High';
    riskLabel = 'Long Distance — Elevated Risk';
  } else if (durationHr > 5 && distanceKm < 400) {
    risk      = 'Medium';
    riskLabel = 'Possible Traffic Congestion';
  } else if (durationHr > 4 || distanceKm > 400) {
    risk      = 'Medium';
    riskLabel = 'Moderate Distance — Some Risk';
  } else {
    risk      = 'Low';
    riskLabel = 'Low Risk Route';
  }

  var estimatedCost = Math.round(distanceKm * 2.5);

  return {
    name: name,
    distanceKm: distanceKm,
    durationHr: durationHr,
    costLevel: costLevel,
    traffic: traffic,
    risk: risk,
    riskLabel: riskLabel,
    geometry: geometry,
    originCoords: originCoords,
    destCoords: destCoords,
    originLabel: originLabel,
    destLabel: destLabel,
    estimatedCost: estimatedCost
  };
}

function assignRouteTags(routes) {
  if (routes.length < 2) {
    routes[0].tag      = 'Only Route';
    routes[0].tagClass = 'alt-tag';
    routes[0].tagIcon  = 'fa-route';
    return routes;
  }

  var a = routes[0];
  var b = routes[1];

  if (a.durationHr < b.durationHr && a.estimatedCost < b.estimatedCost) {
    a.tag = 'Faster & Cheaper';  a.tagClass = 'faster-tag'; a.tagIcon = 'fa-bolt';
  } else if (a.durationHr < b.durationHr && a.distanceKm < b.distanceKm) {
    a.tag = 'Faster Route';      a.tagClass = 'faster-tag'; a.tagIcon = 'fa-bolt';
  } else if (a.durationHr < b.durationHr) {
    a.tag = 'Faster Route';      a.tagClass = 'faster-tag'; a.tagIcon = 'fa-bolt';
  } else if (a.estimatedCost < b.estimatedCost) {
    a.tag = 'Lower Cost';        a.tagClass = 'faster-tag'; a.tagIcon = 'fa-tag';
  } else if (a.distanceKm < b.distanceKm) {
    a.tag = 'Shorter Distance';  a.tagClass = 'faster-tag'; a.tagIcon = 'fa-road';
  } else {
    a.tag = 'Balanced Route';    a.tagClass = 'alt-tag';    a.tagIcon = 'fa-scale-balanced';
  }

  if (b.durationHr < a.durationHr && b.estimatedCost < a.estimatedCost) {
    b.tag = 'Faster & Cheaper';  b.tagClass = 'faster-tag'; b.tagIcon = 'fa-bolt';
  } else if (b.estimatedCost < a.estimatedCost) {
    b.tag = 'Lower Cost';        b.tagClass = 'faster-tag'; b.tagIcon = 'fa-tag';
  } else if (b.distanceKm < a.distanceKm) {
    b.tag = 'Shorter Distance';  b.tagClass = 'faster-tag'; b.tagIcon = 'fa-road';
  } else if (b.durationHr < a.durationHr) {
    b.tag = 'Faster Route';      b.tagClass = 'faster-tag'; b.tagIcon = 'fa-bolt';
  } else if (b.risk === 'Low' && a.risk !== 'Low') {
    b.tag = 'Lower Risk';        b.tagClass = 'alt-tag';    b.tagIcon = 'fa-shield';
  } else {
    b.tag = 'Alternative Route'; b.tagClass = 'alt-tag';    b.tagIcon = 'fa-shuffle';
  }

  return routes;
}

function recommendBestRoute(routes) {
  if (routes.length < 2) return routes;

  var a = routes[0];
  var b = routes[1];

  var scoreA = 0;
  var scoreB = 0;

  if (a.durationHr <= b.durationHr) scoreA += 1;
  if (a.estimatedCost <= b.estimatedCost) scoreA += 1;
  if (a.distanceKm <= b.distanceKm) scoreA += 1;
  if (a.risk === 'Low') scoreA += 2;
  if (a.risk === 'Medium') scoreA += 1;

  if (b.durationHr <= a.durationHr) scoreB += 1;
  if (b.estimatedCost <= a.estimatedCost) scoreB += 1;
  if (b.distanceKm <= a.distanceKm) scoreB += 1;
  if (b.risk === 'Low') scoreB += 2;
  if (b.risk === 'Medium') scoreB += 1;

  if (scoreA >= scoreB) {
    routes[0].recommended = true;
    routes[1].recommended = false;
  } else {
    routes[0].recommended = false;
    routes[1].recommended = true;
  }

  return routes;
}

// ----- ROUTE MAP -----
function buildRouteMapFrame(route) {
  if (!route.originCoords || !route.destCoords) return null;

  var originLat  = route.originCoords[1];
  var originLng  = route.originCoords[0];
  var destLat    = route.destCoords[1];
  var destLng    = route.destCoords[0];

  var geom = route.geometry ? JSON.stringify(route.geometry) : 'null';
  var routeColor = route.name === 'Route A' ? '#8FB9B4' : '#A3B18A';
  var mapboxToken = 'pk.eyJ1Ijoic2FyYWhhbGFuc2FyaSIsImEiOiJjbW9tMmw3OXgwbWNnMnFzYTh0aWdhczBxIn0.505lxinv6ux9RoRy8W0sJg';

  var mapHTML = '<!DOCTYPE html><html><head>' +
    '<meta charset="UTF-8"/>' +
    '<meta name="viewport" content="initial-scale=1,maximum-scale=1,user-scalable=no"/>' +
    '<link href="https://api.mapbox.com/mapbox-gl-js/v3.23.1/mapbox-gl.css" rel="stylesheet"/>' +
    '<style>html,body,#map{margin:0;padding:0;width:100%;height:100%;background:#1E2A2B;}' +
    '.mapboxgl-ctrl-logo,.mapboxgl-ctrl-attrib{display:none!important;}' +
    '.route-marker{width:16px;height:16px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);}' +
    '.origin-marker{background:#A3B18A;}.dest-marker{background:#ff4d4d;}</style>' +
    '</head><body>' +
    '<div id="map"></div>' +
    '<script src="https://api.mapbox.com/mapbox-gl-js/v3.23.1/mapbox-gl.js"><\/script>' +
    '<script>' +
    'mapboxgl.accessToken = "' + mapboxToken + '";' +
    'var originLngLat = [' + originLng + ',' + originLat + '];' +
    'var destLngLat = [' + destLng + ',' + destLat + '];' +
    'var geom = ' + geom + ';' +
    'if (!geom || !geom.coordinates) { geom = {type:"LineString",coordinates:[originLngLat,destLngLat]}; }' +
    'var map = new mapboxgl.Map({' +
    '  container:"map",' +
    '  style:"mapbox://styles/mapbox/streets-v12",' +
    '  center:originLngLat,' +
    '  zoom:6,' +
    '  attributionControl:false' +
    '});' +
    'map.on("error", function(e){ console.error("Mapbox map error:", e && e.error ? e.error : e); });' +
    'map.addControl(new mapboxgl.NavigationControl({showCompass:false}), "top-right");' +
    'function marker(className, coords, label){' +
    '  var el = document.createElement("div");' +
    '  el.className = "route-marker " + className;' +
    '  new mapboxgl.Marker(el).setLngLat(coords).setPopup(new mapboxgl.Popup({offset:18}).setText(label)).addTo(map);' +
    '}' +
    'map.on("load", function(){' +
    '  map.addSource("route", {type:"geojson", data:{type:"Feature", properties:{}, geometry:geom}});' +
    '  map.addLayer({id:"route-line",type:"line",source:"route",layout:{"line-join":"round","line-cap":"round"},paint:{"line-color":"' + routeColor + '","line-width":5,"line-opacity":0.9}});' +
    '  marker("origin-marker", originLngLat, "Origin");' +
    '  marker("dest-marker", destLngLat, "Destination");' +
    '  var bounds = new mapboxgl.LngLatBounds();' +
    '  geom.coordinates.forEach(function(coord){ bounds.extend(coord); });' +
    '  bounds.extend(originLngLat);' +
    '  bounds.extend(destLngLat);' +
    '  map.fitBounds(bounds, {padding:35, maxZoom:10, duration:0});' +
    '  map.resize();' +
    '});' +
    '<\/script></body></html>';

  var mapDiv = document.createElement('div');
  mapDiv.setAttribute('class', 'route-map');
  mapDiv.style.width    = '100%';
  mapDiv.style.height   = '300px';
  mapDiv.style.position = 'relative';
  mapDiv.style.overflow = 'hidden';
  mapDiv.style.borderRadius = '8px';

  var iframe = document.createElement('iframe');
  iframe.setAttribute('title', route.name + ' map');
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  iframe.srcdoc = mapHTML;
  iframe.style.width   = '100%';
  iframe.style.height  = '100%';
  iframe.style.border  = 'none';
  iframe.style.display = 'block';

  iframe.addEventListener('load', function () {
    try {
      var win = iframe.contentWindow;
      if (win && win.map && typeof win.map.resize === 'function') {
        win.map.resize();
      }
    } catch (e) {}
  });

  mapDiv.appendChild(iframe);
  return mapDiv;
}

// ----- DISPLAY RESULTS -----
function displayResults(shipping, routes) {
  routes = assignRouteTags(routes);
  routes = recommendBestRoute(routes);

  var iconEl = document.getElementById('shippingIcon');
  iconEl.setAttribute('class', 'fa-solid ' + shipping.icon + ' result-icon');
  document.getElementById('shippingMethod').innerText = shipping.method;
  document.getElementById('shippingReason').innerText = shipping.reason;

  if (routes[0] && routes[0].originLabel && routes[0].destLabel) {
    document.getElementById('routesNote').innerText =
      'Showing two different real routes from ' + routes[0].originLabel +
      ' to ' + routes[0].destLabel + '. Select one route before saving.';
  }

  while (routesGrid.firstChild) {
    routesGrid.removeChild(routesGrid.firstChild);
  }

  selectedRoute = null;
  saveSection.classList.add('hidden');
  dbNotice.classList.add('hidden');

  for (var i = 0; i < routes.length; i++) {
    routesGrid.appendChild(buildRouteCard(routes[i]));
  }

  resultsSection.classList.remove('hidden');
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildRouteCard(route) {
  var card = document.createElement('div');
  card.setAttribute('class', 'route-card');
  card.setAttribute('data-route-name', route.name);

  var badge = document.createElement('div');
  badge.setAttribute('class', 'route-badge');
  badge.innerText = route.name;

  var tag = document.createElement('div');
  tag.setAttribute('class', 'route-tag ' + (route.tagClass || 'alt-tag'));

  var tagIcon = document.createElement('i');
  tagIcon.setAttribute('class', 'fa-solid ' + (route.tagIcon || 'fa-route'));
  tag.appendChild(tagIcon);
  tag.appendChild(document.createTextNode(' ' + (route.tag || 'Route')));

  var placeLine = document.createElement('p');
  placeLine.setAttribute('class', 'route-place-line');
  placeLine.innerText = route.originLabel + ' to ' + route.destLabel;

  var statsDiv = document.createElement('div');
  statsDiv.setAttribute('class', 'route-stats');

  var statsData = [
    { label: 'Distance',       val: route.distanceKm + ' km',          cls: '' },
    { label: 'Est. Duration',  val: route.durationHr + ' hrs',         cls: '' },
    { label: 'Est. Cost',      val: route.estimatedCost + ' SAR',      cls: '' },
    { label: 'Cost Level',     val: route.costLevel,                   cls: 'level-' + route.costLevel.toLowerCase() },
    { label: 'Traffic',        val: route.traffic,                     cls: 'level-' + route.traffic.toLowerCase() },
    { label: 'Risk',           val: route.riskLabel || route.risk,     cls: 'level-' + route.risk.toLowerCase() }
  ];

  for (var j = 0; j < statsData.length; j++) {
    var row = document.createElement('div');
    row.setAttribute('class', 'route-stat-row');

    var lbl = document.createElement('span');
    lbl.setAttribute('class', 'route-stat-label');
    lbl.innerText = statsData[j].label;

    var val = document.createElement('span');
    val.setAttribute('class', 'route-stat-val ' + statsData[j].cls);
    val.innerText = statsData[j].val;

    row.appendChild(lbl);
    row.appendChild(val);
    statsDiv.appendChild(row);
  }

  var btn = document.createElement('button');
  btn.setAttribute('class', 'route-select-btn');
  btn.innerText = 'Select Route';

  (function (r, cardEl, btnEl) {
    btnEl.addEventListener('click', function () {
      var allCards = document.querySelectorAll('.route-card');
      for (var k = 0; k < allCards.length; k++) {
        allCards[k].classList.remove('selected');
        var otherBtn = allCards[k].querySelector('.route-select-btn');
        if (otherBtn) otherBtn.innerText = 'Select Route';
      }

      cardEl.classList.add('selected');
      btnEl.innerText = 'Selected ✓';
      selectedRoute = r;

      var summary = document.getElementById('selectedRouteSummary');
      summary.innerHTML = '<strong>' + r.name + '</strong> — ' +
        r.distanceKm + ' km &nbsp;|&nbsp; ' +
        r.durationHr + ' hrs &nbsp;|&nbsp; Est. Cost: ' + r.estimatedCost + ' SAR' +
        ' &nbsp;|&nbsp; Cost Level: ' + r.costLevel +
        ' &nbsp;|&nbsp; Traffic: ' + r.traffic +
        ' &nbsp;|&nbsp; Risk: ' + r.risk;

      saveSection.classList.remove('hidden');
      dbNotice.classList.add('hidden');
    });
  })(route, card, btn);

  if (route.recommended) {
    var recBadge = document.createElement('div');
    recBadge.setAttribute('class', 'route-recommended-badge');
    recBadge.innerHTML = '<i class="fa-solid fa-circle-check"></i> Recommended';
    card.appendChild(recBadge);
  }

  card.appendChild(badge);
  card.appendChild(placeLine);
  card.appendChild(tag);
  card.appendChild(statsDiv);

  var routeMap = buildRouteMapFrame(route);
  if (routeMap) card.appendChild(routeMap);

  card.appendChild(btn);
  return card;
}

// ----- VALIDATION -----
function validateDecisionForm() {
  var isValid = true;
  var placePattern = /^[A-Za-z\s.'-]+$/;

  var shipmentType = document.getElementById('shipmentType');
  if (!shipmentType.value) {
    showError('errShipmentType', shipmentType, 'Please select a shipment type.');
    isValid = false;
  }

  var weight = document.getElementById('weight');
  if (!weight.value || isNaN(weight.value) || parseFloat(weight.value) <= 0) {
    showError('errWeight', weight, 'Enter a valid weight greater than 0.');
    isValid = false;
  }

  var origin = document.getElementById('origin');
  if (!origin.value.trim() || origin.value.trim().length < 2) {
    showError('errOrigin', origin, 'Please enter a valid city or country name.');
    isValid = false;
  } else if (!placePattern.test(origin.value.trim())) {
    showError('errOrigin', origin, 'Please enter a valid city or country name.');
    isValid = false;
  }

  var destination = document.getElementById('destination');
  if (!destination.value.trim() || destination.value.trim().length < 2) {
    showError('errDestination', destination, 'Please enter a valid city or country name.');
    isValid = false;
  } else if (!placePattern.test(destination.value.trim())) {
    showError('errDestination', destination, 'Please enter a valid city or country name.');
    isValid = false;
  }

  var deliveryDate = document.getElementById('deliveryDate');
  if (!deliveryDate.value) {
    showError('errDeliveryDate', deliveryDate, 'Please select a delivery date.');
    isValid = false;
  } else {
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    var selected = new Date(deliveryDate.value);
    if (selected < today) {
      showError('errDeliveryDate', deliveryDate, 'Delivery date cannot be in the past.');
      isValid = false;
    }
  }

  var budget = document.getElementById('budget');
  if (budget.value && (isNaN(budget.value) || parseFloat(budget.value) < 1)) {
    showError('errBudget', budget, 'Budget must be a positive number.');
    isValid = false;
  }

  return isValid;
}

function showError(errorId, inputEl, message) {
  var errSpan = document.getElementById(errorId);
  if (errSpan) errSpan.innerText = message;
  if (inputEl) inputEl.classList.add('error');
}

function clearAllErrors() {
  var errorSpans = document.querySelectorAll('.field-error');
  for (var i = 0; i < errorSpans.length; i++) errorSpans[i].innerText = '';

  var errorInputs = document.querySelectorAll('.error');
  for (var j = 0; j < errorInputs.length; j++) errorInputs[j].classList.remove('error');
}

function setLoading(on) {
  if (on) {
    submitBtn.setAttribute('disabled', true);
    submitText.classList.add('hidden');
    submitLoader.classList.remove('hidden');
  } else {
    submitBtn.removeAttribute('disabled');
    submitText.classList.remove('hidden');
    submitLoader.classList.add('hidden');
  }
}

function setSaveLoading(on) {
  var saveText   = document.getElementById('saveText');
  var saveLoader = document.getElementById('saveLoader');

  if (on) {
    saveBtn.setAttribute('disabled', true);
    saveText.classList.add('hidden');
    saveLoader.classList.remove('hidden');
  } else {
    saveBtn.removeAttribute('disabled');
    saveText.classList.remove('hidden');
    saveLoader.classList.add('hidden');
  }
}

// ----- LIVE FOCUS EVENTS -----
var watchFields = ['origin', 'destination', 'weight'];
for (var w = 0; w < watchFields.length; w++) {
  (function (fid) {
    var el = document.getElementById(fid);
    if (el) {
      el.addEventListener('focus', function () {
        el.classList.remove('error');
        var errEl = document.getElementById('err' + fid.charAt(0).toUpperCase() + fid.slice(1));
        if (errEl) errEl.innerText = '';
      });
    }
  })(watchFields[w]);
}

var weightInput = document.getElementById('weight');
if (weightInput) {
  weightInput.addEventListener('keypress', function (e) {
    if (!/[\d.]/.test(String.fromCharCode(e.which))) e.preventDefault();
  });
}
