// api/flights.js — Duffel Flight Search for One-Up Travel
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  var DUFFEL_TOKEN = process.env.DUFFEL_TOKEN || "duffel_test_FGeAjoiFL8XVSJ9dfqg8UeOaP0uKBbeL0b_i3S7xZcN";

  try {
    var body = req.body;
    var origin = body.origin;         // IATA code e.g. "BNE"
    var destination = body.destination; // IATA code e.g. "DPS"
    var departDate = body.departDate;  // "2026-05-05"
    var returnDate = body.returnDate;  // "2026-05-12" or null for one-way
    var passengers = body.passengers || 1;
    var cabinClass = body.cabinClass || "economy";

    if (!origin || !destination || !departDate) {
      return res.status(400).json({ error: "Missing origin, destination, or departDate" });
    }

    // Build slices
    var slices = [
      { origin: origin, destination: destination, departure_date: departDate }
    ];
    if (returnDate) {
      slices.push({ origin: destination, destination: origin, departure_date: returnDate });
    }

    // Build passengers array
    var passengerList = [];
    for (var i = 0; i < passengers; i++) {
      passengerList.push({ type: "adult" });
    }

    // Call Duffel API
    var duffelRes = await fetch("https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=15000", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip",
        "Duffel-Version": "v2",
        "Authorization": "Bearer " + DUFFEL_TOKEN
      },
      body: JSON.stringify({
        data: {
          cabin_class: cabinClass,
          slices: slices,
          passengers: passengerList
        }
      })
    });

    if (!duffelRes.ok) {
      var errBody = await duffelRes.text();
      console.error("Duffel API error:", duffelRes.status, errBody);
      return res.status(500).json({ error: "Duffel API error", status: duffelRes.status, detail: errBody.substring(0, 500) });
    }

    var duffelData = await duffelRes.json();
    var offers = duffelData.data && duffelData.data.offers ? duffelData.data.offers : [];

    // Parse offers into Lisa-friendly format
    var flights = [];
    var seen = {};

    offers.forEach(function(offer) {
      if (flights.length >= 8) return; // Max 8 results

      var totalAmount = offer.total_amount;
      var currency = offer.total_currency;
      var owner = offer.owner || {};
      var airlineName = owner.name || "Unknown";
      var airlineCode = owner.iata_code || "";

      // Process each slice (outbound, return)
      var sliceData = offer.slices || [];
      if (sliceData.length === 0) return;

      var outbound = sliceData[0];
      var segments = outbound.segments || [];
      if (segments.length === 0) return;

      var firstSeg = segments[0];
      var lastSeg = segments[segments.length - 1];

      var departAirport = firstSeg.origin && firstSeg.origin.iata_code ? firstSeg.origin.iata_code : "";
      var departCity = firstSeg.origin && firstSeg.origin.city_name ? firstSeg.origin.city_name : "";
      var departTime = firstSeg.departing_at ? firstSeg.departing_at.substring(11, 16) : "";
      var arriveAirport = lastSeg.destination && lastSeg.destination.iata_code ? lastSeg.destination.iata_code : "";
      var arriveCity = lastSeg.destination && lastSeg.destination.city_name ? lastSeg.destination.city_name : "";
      var arriveTime = lastSeg.arriving_at ? lastSeg.arriving_at.substring(11, 16) : "";

      // Calculate duration
      var duration = outbound.duration || "";
      if (duration && duration.startsWith("PT")) {
        var hours = duration.match(/(\d+)H/);
        var mins = duration.match(/(\d+)M/);
        duration = (hours ? hours[1] + "h " : "") + (mins ? mins[1] + "m" : "");
      }

      // Stops
      var stops = segments.length === 1 ? "Direct" : (segments.length - 1) + " stop" + (segments.length > 2 ? "s" : "");

      // Flight number
      var flightNo = firstSeg.marketing_carrier ? (firstSeg.marketing_carrier.iata_code + firstSeg.marketing_carrier_flight_number) : "";

      // Baggage
      var baggageDesc = "";
      if (firstSeg.passengers && firstSeg.passengers[0]) {
        var pax = firstSeg.passengers[0];
        var bags = pax.baggages || [];
        bags.forEach(function(b) {
          if (b.type === "checked") baggageDesc += b.quantity + "x checked (" + (b.weight ? b.weight + "kg" : "") + ") ";
          if (b.type === "carry_on") baggageDesc += "Carry-on included ";
        });
      }
      if (!baggageDesc) baggageDesc = "Check airline";

      // De-duplicate by airline + time
      var key = airlineCode + departTime + arriveTime + stops;
      if (seen[key]) return;
      seen[key] = true;

      // Build legs for multi-stop
      var legs = [];
      if (segments.length > 1) {
        segments.forEach(function(seg, idx) {
          var segDepart = seg.departing_at ? seg.departing_at.substring(11, 16) : "";
          var segArrive = seg.arriving_at ? seg.arriving_at.substring(11, 16) : "";
          var segOrigin = seg.origin ? seg.origin.iata_code : "";
          var segDest = seg.destination ? seg.destination.iata_code : "";
          var segOriginCity = seg.origin ? (seg.origin.city_name || seg.origin.name || "") : "";
          var segDestCity = seg.destination ? (seg.destination.city_name || seg.destination.name || "") : "";
          var segDuration = seg.duration || "";
          if (segDuration && segDuration.startsWith("PT")) {
            var sh = segDuration.match(/(\d+)H/);
            var sm = segDuration.match(/(\d+)M/);
            segDuration = (sh ? sh[1] + "h " : "") + (sm ? sm[1] + "m" : "");
          }
          var segFlightNo = seg.marketing_carrier ? (seg.marketing_carrier.iata_code + seg.marketing_carrier_flight_number) : "";

          legs.push({
            flightNo: segFlightNo,
            departAirport: segOrigin,
            departCity: segOriginCity,
            departTime: segDepart,
            arriveAirport: segDest,
            arriveCity: segDestCity,
            arriveTime: segArrive,
            duration: segDuration
          });

          // Add layover between segments
          if (idx < segments.length - 1) {
            var nextSeg = segments[idx + 1];
            var layoverStart = seg.arriving_at;
            var layoverEnd = nextSeg.departing_at;
            var layoverMins = 0;
            if (layoverStart && layoverEnd) {
              layoverMins = Math.round((new Date(layoverEnd) - new Date(layoverStart)) / 60000);
            }
            var layoverH = Math.floor(layoverMins / 60);
            var layoverM = layoverMins % 60;
            legs.push({
              layover: layoverH + "h " + layoverM + "m",
              airport: seg.destination ? seg.destination.iata_code : "",
              city: seg.destination ? (seg.destination.city_name || seg.destination.name || "") : ""
            });
          }
        });
      }

      // Price formatting
      var priceStr = "$" + Math.round(parseFloat(totalAmount));
      if (currency && currency !== "AUD") priceStr += " " + currency;

      flights.push({
        airline: airlineName,
        flightNo: flightNo,
        departAirport: departAirport,
        departCity: departCity,
        departTime: departTime,
        arriveAirport: arriveAirport,
        arriveCity: arriveCity,
        arriveTime: arriveTime,
        duration: duration.trim(),
        stops: stops,
        class: cabinClass.charAt(0).toUpperCase() + cabinClass.slice(1),
        price: priceStr,
        priceLabel: passengers > 1 ? "total for " + passengers : "per person",
        baggage: baggageDesc.trim(),
        bookUrl: "",
        legs: legs,
        duffelOfferId: offer.id
      });
    });

    // Sort by price
    flights.sort(function(a, b) {
      var pa = parseFloat(a.price.replace(/[^0-9.]/g, "")) || 0;
      var pb = parseFloat(b.price.replace(/[^0-9.]/g, "")) || 0;
      return pa - pb;
    });

    return res.status(200).json({
      success: true,
      count: flights.length,
      flights: flights,
      source: "duffel",
      testMode: DUFFEL_TOKEN.includes("_test_")
    });

  } catch (err) {
    console.error("Flight search error:", err);
    return res.status(500).json({ error: "Flight search failed", message: err.message });
  }
};
