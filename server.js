// server.js — Logistics Mind Backend
const express  = require('express');
const mysql    = require('mysql2');
const path     = require('path');
const https    = require('https');

const app  = express();
const PORT = process.env.PORT || 3001;

const ORS_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjY4MzM5MmYzMDRhNTQwYmFhMTA2MzgxNzY1OWEyZDdkIiwiaCI6Im11cm11cjY0In0=';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const db = mysql.createConnection({
  host:     process.env.DB_HOST || 'localhost',
  user:     process.env.DB_USER || 'root',
  password: '1234',
  database: process.env.DB_NAME || 'smart_logistics'
});

db.connect(function (err) {
  if (err) {
    console.warn('MySQL connection failed. Running without database.');
    console.warn('Error:', err.message);
  } else {
    console.log('MySQL connected.');
    initDatabase();
  }
});

function initDatabase() {
  var decisionsSql = `
    CREATE TABLE IF NOT EXISTS decisions (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      shipment_type   VARCHAR(50)   NOT NULL,
      weight          DECIMAL(10,2) NOT NULL,
      origin          VARCHAR(100)  NOT NULL,
      destination     VARCHAR(100)  NOT NULL,
      delivery_date   DATE          NOT NULL,
      budget          DECIMAL(10,2) DEFAULT NULL,
      shipping_method VARCHAR(100)  NOT NULL,
      selected_route  VARCHAR(50)   NOT NULL,
      distance_km     DECIMAL(10,2) NOT NULL,
      duration_hr     DECIMAL(10,2) NOT NULL,
      cost_level      VARCHAR(20)   NOT NULL,
      traffic_level   VARCHAR(20)   NOT NULL,
      risk_level      VARCHAR(20)   NOT NULL,
      created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
    )
  `;
  var contactMessagesSql = `
    CREATE TABLE IF NOT EXISTS contact_messages (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      name       VARCHAR(100) NOT NULL,
      email      VARCHAR(255) NOT NULL,
      message    TEXT         NOT NULL,
      created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
    )
  `;

  db.query(decisionsSql, function (err) {
    if (err) console.error('Table creation error:', err.message);
    else console.log('decisions table ready.');
  });

  db.query(contactMessagesSql, function (err) {
    if (err) console.error('Contact table creation error:', err.message);
    else console.log('contact_messages table ready.');
  });
}

function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>'";&]/g, '').trim().substring(0, 255);
}

function sanitizeMessage(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>'";&]/g, '').trim().substring(0, 1000);
}

function sanitizeNumber(val) {
  var n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function cleanLocationName(value) {
  return sanitizeString(value).replace(/\s+/g, ' ').trim();
}

// Helper: perform an HTTPS GET request, returns a Promise<object>
function httpsGet(url) {
  return new Promise(function (resolve, reject) {
    https.get(url, { headers: { 'Accept': 'application/json' } }, function (res) {
      var body = '';
      res.on('data', function (chunk) { body += chunk; });
      res.on('end', function () {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          reject(new Error('Failed to parse geocode response'));
        }
      });
    }).on('error', function (e) { reject(e); });
  });
}

// Helper: perform an HTTPS POST request, returns a Promise<object>
function httpsPost(hostname, path, headers, bodyObj) {
  return new Promise(function (resolve, reject) {
    var bodyStr = JSON.stringify(bodyObj);
    var options = {
      hostname: hostname,
      path: path,
      method: 'POST',
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }, headers)
    };

    var req = https.request(options, function (res) {
      var body = '';
      res.on('data', function (chunk) { body += chunk; });
      res.on('end', function () {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          reject(new Error('Failed to parse route response'));
        }
      });
    });

    req.on('error', function (e) { reject(e); });
    req.write(bodyStr);
    req.end();
  });
}

function normalizePlaceName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z]/g, '');
}

function isAcceptedPlaceFeature(feature, requestedName) {
  if (!feature || !feature.geometry || !feature.geometry.coordinates || !feature.properties) return false;

  var props = feature.properties;
  var layer = props.layer || '';
  var allowedLayers = ['locality', 'localadmin', 'region', 'macroregion', 'country'];

  if (!allowedLayers.includes(layer)) return false;
  if (props.confidence !== undefined && props.confidence < 0.6) return false;

  var requested = normalizePlaceName(requestedName);
  var name      = normalizePlaceName(props.name);
  var label     = normalizePlaceName(props.label);

  return name === requested || label.indexOf(requested) !== -1;
}

async function geocodeLocationServer(locationName) {
  var url =
    'https://api.openrouteservice.org/geocode/search?api_key=' + ORS_API_KEY +
    '&text=' + encodeURIComponent(locationName) +
    '&size=5';

  var result = await httpsGet(url);

  if (result.status !== 200 || !result.data.features || result.data.features.length === 0) {
    throw new Error('Place not found: ' + locationName + '. Enter a real city or country name.');
  }

  for (var i = 0; i < result.data.features.length; i++) {
    if (isAcceptedPlaceFeature(result.data.features[i], locationName)) {
      var props = result.data.features[i].properties;
      return {
        coords: result.data.features[i].geometry.coordinates,
        label:  props.label || props.name || locationName
      };
    }
  }

  throw new Error('Invalid place: ' + locationName + '. Enter a real city or country name, not a street or landmark.');
}

function routeFromFeature(feature) {
  var summary  = feature.properties.summary;
  var geometry = feature.geometry; // GeoJSON LineString

  return {
    distanceKm: parseFloat(summary.distance.toFixed(1)),
    durationHr: parseFloat((summary.duration / 3600).toFixed(1)),
    geometry:   geometry
  };
}

function routeCoordinateSet(route) {
  var set = {};
  if (!route || !route.geometry || !route.geometry.coordinates) return set;

  for (var i = 0; i < route.geometry.coordinates.length; i++) {
    var c = route.geometry.coordinates[i];
    set[c[0].toFixed(2) + ',' + c[1].toFixed(2)] = true;
  }

  return set;
}

function routeSimilarity(routeA, routeB) {
  var setA = routeCoordinateSet(routeA);
  var setB = routeCoordinateSet(routeB);
  var countA = Object.keys(setA).length;
  var countB = Object.keys(setB).length;
  var shared = 0;

  if (countA === 0 || countB === 0) return 1;

  Object.keys(setA).forEach(function (key) {
    if (setB[key]) shared++;
  });

  return shared / Math.min(countA, countB);
}

function routesAreDifferent(routeA, routeB) {
  if (!routeA || !routeB) return false;

  var distanceGap = Math.abs(routeA.distanceKm - routeB.distanceKm);
  var durationGap = Math.abs(routeA.durationHr - routeB.durationHr);

  return routeSimilarity(routeA, routeB) < 0.7 &&
    (distanceGap >= 5 || durationGap >= 0.1);
}

function pickDifferentRoutePair(routes) {
  routes.sort(function (a, b) {
    return a.durationHr - b.durationHr;
  });

  for (var i = 0; i < routes.length; i++) {
    for (var j = i + 1; j < routes.length; j++) {
      if (routesAreDifferent(routes[i], routes[j])) {
        return [routes[i], routes[j]];
      }
    }
  }

  return [];
}

async function fetchRouteServer(originCoords, destCoords, bodyOptions) {
  var result = await httpsPost(
    'api.openrouteservice.org',
    '/v2/directions/driving-car/geojson',
    { 'Authorization': ORS_API_KEY },
    Object.assign({
      coordinates: [originCoords, destCoords],
      units: 'km',
      geometry: true
    }, bodyOptions || {})
  );

  var data = result.data;

  if (
    result.status !== 200 ||
    !data.features ||
    !data.features[0] ||
    !data.features[0].properties ||
    !data.features[0].properties.summary
  ) {
    console.error('ORS response:', JSON.stringify(data));
    throw new Error('Route API failed');
  }

  return data.features.map(routeFromFeature);
}

async function fetchRouteGeometryServer(originCoords, destCoords, waypointCoords) {
  var coordinates = [originCoords];

  if (waypointCoords) {
    coordinates.push(waypointCoords);
  }

  coordinates.push(destCoords);

  var routes = await fetchRouteServer(originCoords, destCoords, {
    coordinates: coordinates,
    preference: 'fastest'
  });

  return routes[0];
}

async function fetchRouteViaWaypointServer(originCoords, destCoords, waypointName) {
  try {
    var waypoint = await geocodeLocationServer(waypointName);
    return await fetchRouteGeometryServer(originCoords, destCoords, waypoint.coords);
  } catch (err) {
    console.warn('Waypoint route failed:', waypointName, err.message);
    return null;
  }
}

async function fetchTwoDifferentRoutesServer(originCoords, destCoords, originLabel, destLabel) {
  var candidates = [];
  
    var routeRequests = [
    { preference: 'fastest' },
    { preference: 'recommended' },
    { preference: 'shortest' },
    { preference: 'fastest', options: { avoid_features: ['tollways'] } },
    { preference: 'fastest', options: { avoid_features: ['highways'] } }
  ];

  for (var i = 0; i < routeRequests.length; i++) {
    try {
      var routes = await fetchRouteServer(originCoords, destCoords, routeRequests[i]);
      candidates = candidates.concat(routes);
    } catch (err) {
      console.warn('Route strategy failed:', err.message);
    }
  }

  if (
    /jeddah/i.test(originLabel) && /dubai/i.test(destLabel) ||
    /dubai/i.test(originLabel) && /jeddah/i.test(destLabel)
  ) {
    var viaRiyadh = await fetchRouteViaWaypointServer(originCoords, destCoords, 'Riyadh');
    var viaMedina = await fetchRouteViaWaypointServer(originCoords, destCoords, 'Medina');
    if (viaRiyadh) candidates.push(viaRiyadh);
    if (viaMedina) candidates.push(viaMedina);
  }

  var pair = pickDifferentRoutePair(candidates);

  if (pair.length < 2) {
    throw new Error('please enter real city names');
  }

  pair.sort(function (a, b) {
    return a.durationHr - b.durationHr;
  });

  return pair;
}

// GET /api/decisions — all records
app.get('/api/decisions', function (req, res) {
  db.query('SELECT * FROM decisions ORDER BY created_at DESC LIMIT 100', function (err, results) {
    if (err) return res.status(500).json({ success: false, error: 'Database error' });
    res.json({ success: true, data: results });
  });
});

// POST /api/contact — save one contact form message
app.post('/api/contact', function (req, res) {
  var name    = sanitizeString(req.body.name);
  var email   = sanitizeString(req.body.email);
  var message = sanitizeMessage(req.body.message);
  var errors  = [];

  if (!name || name.length < 2 || name.length > 100) errors.push('Name is required.');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Valid email is required.');
  if (!message || message.length < 10 || message.length > 1000) errors.push('Message must be between 10 and 1000 characters.');

  if (errors.length > 0) return res.status(400).json({ success: false, errors: errors });

  db.query(
    'INSERT INTO contact_messages (name, email, message) VALUES (?, ?, ?)',
    [name, email, message],
    function (err, result) {
      if (err) {
        console.error('Contact insert error:', err.message);
        return res.status(500).json({ success: false, error: 'Failed to save contact message.' });
      }
      res.json({ success: true, id: result.insertId });
    }
  );
});

// POST /api/routes — fetch real route data from OpenRouteService
app.post('/api/routes', async function (req, res) {
  try {
    var origin      = cleanLocationName(req.body.origin);
    var destination = cleanLocationName(req.body.destination);

    if (!origin || !destination) {
      return res.status(400).json({
        success: false,
        error: 'Origin and destination are required.'
      });
    }

    var originPlace = await geocodeLocationServer(origin);
    var destPlace   = await geocodeLocationServer(destination);
    var originCoords = originPlace.coords;
    var destCoords   = destPlace.coords;

    var routes = await fetchTwoDifferentRoutesServer(
      originCoords,
      destCoords,
      originPlace.label,
      destPlace.label
    );
    var routeA = routes[0];
    var routeB = routes[1];

    res.json({
      success: true,
      originCoords: originCoords,
      destCoords:   destCoords,
      origin:        originPlace,
      destination:   destPlace,
      routes: [
        {
          name:       'Route A',
          distanceKm: routeA.distanceKm,
          durationHr: routeA.durationHr,
          geometry:   routeA.geometry
        },
        {
          name:       'Route B',
          distanceKm: routeB.distanceKm,
          durationHr: routeB.durationHr,
          geometry:   routeB.geometry
        }
      ]
    });
  } catch (err) {
    console.error('Route error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// POST /api/decisions — save one decision
app.post('/api/decisions', function (req, res) {
  var body   = req.body;
  var errors = [];

  var shipmentType = sanitizeString(body.shipmentType);
  if (!['normal', 'fragile', 'time-sensitive'].includes(shipmentType)) errors.push('Invalid shipment type.');

  var weight = sanitizeNumber(body.weight);
  if (!weight || weight <= 0 || weight > 1000000) errors.push('Invalid weight.');

  var origin = sanitizeString(body.origin);
  if (!origin || origin.length < 2) errors.push('Origin is required.');

  var destination = sanitizeString(body.destination);
  if (!destination || destination.length < 2) errors.push('Destination is required.');

  var deliveryDate = sanitizeString(body.deliveryDate);
  if (!deliveryDate || !/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) errors.push('Invalid delivery date.');

  var budget = body.budget ? sanitizeNumber(body.budget) : null;
  if (body.budget && (!budget || budget < 1)) errors.push('Invalid budget.');

  var shippingMethod = sanitizeString(body.shippingMethod);
  if (!shippingMethod) errors.push('Shipping method is required.');

  var selectedRoute = sanitizeString(body.selectedRoute);
  if (!selectedRoute) errors.push('Selected route is required.');

  var distanceKm = sanitizeNumber(body.distanceKm);
  if (!distanceKm || distanceKm <= 0) errors.push('Distance is required.');

  var durationHr = sanitizeNumber(body.durationHr);
  if (!durationHr || durationHr <= 0) errors.push('Duration is required.');

  var costLevel    = sanitizeString(body.costLevel);
  var trafficLevel = sanitizeString(body.trafficLevel);
  var riskLevel    = sanitizeString(body.riskLevel);

  if (!costLevel || !trafficLevel || !riskLevel) errors.push('Cost, traffic, and risk levels are required.');

  if (errors.length > 0) return res.status(400).json({ success: false, errors: errors });

  var sql = `
    INSERT INTO decisions
      (shipment_type, weight, origin, destination, delivery_date, budget,
       shipping_method, selected_route, distance_km, duration_hr,
       cost_level, traffic_level, risk_level)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  var values = [
    shipmentType, weight, origin, destination, deliveryDate, budget,
    shippingMethod, selectedRoute, distanceKm, durationHr, costLevel, trafficLevel, riskLevel
  ];

  db.query(sql, values, function (err, result) {
    if (err) {
      console.error('DB insert error:', err.message);
      return res.status(500).json({ success: false, error: 'Failed to save.' });
    }
    res.json({ success: true, id: result.insertId });
  });
});

app.get('*', function (req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, function () {
  console.log('Server running at http://localhost:' + PORT);
});
