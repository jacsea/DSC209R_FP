import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';

document.addEventListener('DOMContentLoaded', () => {
  console.log('Mapbox GL JS Loaded:', mapboxgl);

  // check if setTelemetry function exists and if so, disable to prevent errors
  if (typeof mapboxgl.setTelemetry === 'function') {
    mapboxgl.setTelemetry(false);
  }

  mapboxgl.accessToken =
    'pk.eyJ1IjoibXp1Y3NkIiwiYSI6ImNtaHpxZTFqNTBycmUybHE2bTZveWJ2a20ifQ.N5_98andr8N6SQOmRSnKKg';

  const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/light-v11',
    center: [-98.5795, 39.8283], //center of USA
    zoom: 3.5,
    minZoom: 3.5,
    maxZoom: 8,
    maxBounds: [
      [-170, 15],
      [-55, 70],
    ],
  });
  window.map = map;

  map.on('load', () => {
    map.addSource('states', {
      type: 'geojson',
      data: './map outlines/gz_2010_us_040_00_20m.json',
    });

    map.addLayer({
      id: 'states-outline',
      type: 'line',
      source: 'states',
      paint: {
        'line-color': '#333',
        'line-width': 0.8,
      },
    });

    map.addSource('us-national-outline', {
      type: 'geojson',
      data: './map outlines/gz_2010_us_outline_20m.json',
    });


    map.addLayer({
      id: 'us-country-boundary',
      type: 'line',
      source: 'us-national-outline',
      paint: {
        'line-color': '#111',
        'line-width': 1.5,
      },
    });

    map.addLayer({
      id: 'states-fill',
      type: 'fill',
      source: 'states',
      paint: {
        'fill-color': ['interpolate', ['linear'], ['get', 'VEP_NUM'], 
        0, '#f2f0f7',
        1000000, '#cbc9e2',
        5000000, '#9e9ac8',
        10000000, '#756bb1',
        20000000, '#54278f'
        ],
        'fill-opacity': 0.3,
      },
    });

    Promise.all([
      fetch('./map outlines/gz_2010_us_040_00_20m.json').then(r => r.json()),
      fetch('./voter_turnout_data.csv').then(r => r.text())
    ])

    .then(([geojson, csvText]) => {
      const csv = Papa.parse(csvText, { header: true }).data;

      const dataByYear = {};
      csv.forEach(row => {
        const year = row.YEAR;
        if (!dataByYear[year]) dataByYear[year] = {};
        if (row.STATE) dataByYear[year][row.STATE] = row;
      });

      function updateMapForYear(year) {
        const lookup = dataByYear[year] || {};

        const merged = geojson.features.map(f => {
          const stateName = f.properties.NAME;
          const cloned = { ...f };
          if (lookup[stateName]) {
            cloned.properties = { ...cloned.properties, ...lookup[stateName] };
            // ensure numeric properties for styling
            cloned.properties.VEP_NUM = Number(lookup[stateName].VEP) || 0;
            cloned.properties.VEP_TURNOUT_RATE_NUM = Number(lookup[stateName].VEP_TURNOUT_RATE) || null;
          } else {
            // if no data for this year, ensure VEP_NUM exists (0) so color expression works
            cloned.properties.VEP_NUM = Number(cloned.properties.VEP) || 0;
            cloned.properties.VEP_TURNOUT_RATE_NUM = Number(cloned.properties.VEP_TURNOUT_RATE) || null;
          }
          return cloned;
        });

        map.getSource('states').setData({
          ...geojson,
          features: merged,
        });
      }

      const yearSlider = document.getElementById('year-slider');
      const yearValue = document.getElementById('year-value');
      if (yearSlider) {
        const initialYear = yearSlider.value;
        // set the visible label to the initial slider value
        if (yearValue) yearValue.textContent = String(initialYear);
        updateMapForYear(initialYear);

        yearSlider.addEventListener('input', (e) => {
          const y = e.target.value;
          // update the visible label as the slider moves
          if (yearValue) yearValue.textContent = String(y);
          updateMapForYear(y);
        });
      }

      const lookup = {};
      csv.forEach(row => {
        if (row.STATE) lookup[row.STATE] = row;
      });

      geojson.features = geojson.features.map(f => {
        const stateName = f.properties.NAME; 
        if (lookup[stateName]) {
          f.properties = { ...f.properties, ...lookup[stateName] };
          // convert initial merged values to numeric fields used for styling
          f.properties.VEP_NUM = Number(f.properties.VEP) || 0;
          f.properties.VEP_TURNOUT_RATE_NUM = Number(f.properties.VEP_TURNOUT_RATE) || null;
        }
        return f;
      });

      console.log("Merged GeoJSON", geojson);

      map.getSource('states').setData(geojson);

      // Popup for showing VEP and VEP_TURNOUT_RATE on hover
      const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });

      map.on('mousemove', 'states-fill', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const feature = e.features && e.features[0];
        if (!feature) return;
        const props = feature.properties || {};
        const stateName = props.NAME || props.STATE || props.STATE_ABV || 'Unknown';

        const vepNum = (props.VEP_NUM !== undefined && props.VEP_NUM !== null) ? Number(props.VEP_NUM) : (props.VEP ? Number(props.VEP) : null);
        const turnoutNum = (props.VEP_TURNOUT_RATE_NUM !== undefined && props.VEP_TURNOUT_RATE_NUM !== null) ? Number(props.VEP_TURNOUT_RATE_NUM) : (props.VEP_TURNOUT_RATE ? Number(props.VEP_TURNOUT_RATE) : null);

        const vepText = (vepNum !== null && !isNaN(vepNum)) ? new Intl.NumberFormat().format(vepNum) : 'N/A';
        const turnoutText = (turnoutNum !== null && !isNaN(turnoutNum)) ? turnoutNum + '%' : 'N/A';

        const html = `
          <div style="font-size:13px">
            <strong>${stateName}</strong><br/>
            <strong>VEP:</strong> ${vepText}<br/>
            <strong>VEP Turnout Rate:</strong> ${turnoutText}
          </div>
        `;

        popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
      });

      map.on('mouseleave', 'states-fill', () => {
        map.getCanvas().style.cursor = '';
        popup.remove();
      });
    });
  });
});
