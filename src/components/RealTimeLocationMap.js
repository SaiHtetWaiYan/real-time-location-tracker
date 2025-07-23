import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import 'leaflet-routing-machine';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { MapPin, Navigation, RefreshCw, AlertCircle, Clock, Route } from 'lucide-react';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const RealTimeLocationMap = () => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const accuracyCircleRef = useRef(null);
  const [isTracking, setIsTracking] = useState(false);
  const [location, setLocation] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState(null);
  const [watchId, setWatchId] = useState(null);
  const [destination, setDestination] = useState('');
  const [routingControl, setRoutingControl] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [eta, setEta] = useState(null);

  const initializeMap = () => {
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current).setView([13.7563, 100.5018], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(mapInstanceRef.current);
    }
  };

  useEffect(() => {
    initializeMap();
  }, []);

  const formatTime = (seconds) => {
    if (!seconds) return 'N/A';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const formatDistance = (meters) => {
    if (!meters) return 'N/A';
    
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`;
    } else {
      return `${Math.round(meters)} m`;
    }
  };

  const calculateETA = (travelTimeSeconds) => {
    if (!travelTimeSeconds) return null;
    
    const now = new Date();
    const eta = new Date(now.getTime() + (travelTimeSeconds * 1000));
    return eta;
  };

  const updateMap = (lat, lng, acc) => {
    const map = mapInstanceRef.current;

    if (!markerRef.current) {
      markerRef.current = L.marker([lat, lng]).addTo(map);
    } else {
      markerRef.current.setLatLng([lat, lng]);
    }

    if (!accuracyCircleRef.current) {
      accuracyCircleRef.current = L.circle([lat, lng], {
        radius: acc,
        color: '#3182ce',
        fillColor: '#3182ce',
        fillOpacity: 0.2
      }).addTo(map);
    } else {
      accuracyCircleRef.current.setLatLng([lat, lng]);
      accuracyCircleRef.current.setRadius(acc);
    }

    setLocation({ lat, lng });
    setAccuracy(acc);
    setLastUpdate(new Date());

    // Update route if destination is set
    if (routingControl && destination) {
      updateRoute(lat, lng);
    }
  };

  const updateRoute = (currentLat, currentLng) => {
    // Update the starting point of the route to current location
    const waypoints = routingControl.getWaypoints();
    if (waypoints.length >= 2) {
      waypoints[0].latLng = L.latLng(currentLat, currentLng);
      routingControl.setWaypoints(waypoints);
    }
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        updateMap(latitude, longitude, accuracy);
        setError(null);
      },
      (err) => {
        setError(err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 10000
      }
    );

    setWatchId(id);
    setIsTracking(true);
  };

  const stopTracking = () => {
    if (watchId) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    setIsTracking(false);
  };

  const centerOnLocation = () => {
    if (location && mapInstanceRef.current) {
      mapInstanceRef.current.setView([location.lat, location.lng], 16);
    }
  };

  const handleDestinationSubmit = async (e) => {
    e.preventDefault();
    if (!location || !destination) return;

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destination)}`
      );
      const data = await res.json();

      if (data && data.length > 0) {
        const dest = data[0];
        const destLatLng = [parseFloat(dest.lat), parseFloat(dest.lon)];

        if (routingControl) {
          mapInstanceRef.current.removeControl(routingControl);
        }

        const control = L.Routing.control({
          waypoints: [
            L.latLng(location.lat, location.lng),
            L.latLng(destLatLng[0], destLatLng[1])
          ],
          routeWhileDragging: false,
          addWaypoints: false,
          draggableWaypoints: false,
          show: false,
          createMarker: () => null
        }).addTo(mapInstanceRef.current);

        // Listen for route found event to get route information
        control.on('routesfound', function(e) {
          const routes = e.routes;
          const summary = routes[0].summary;
          
          setRouteInfo({
            distance: summary.totalDistance,
            time: summary.totalTime
          });

          setEta(calculateETA(summary.totalTime));
        });

        setRoutingControl(control);
      } else {
        setError('Destination not found.');
      }
    } catch (err) {
      setError('Failed to fetch route.');
    }
  };

  const clearRoute = () => {
    if (routingControl) {
      mapInstanceRef.current.removeControl(routingControl);
      setRoutingControl(null);
    }
    setRouteInfo(null);
    setEta(null);
    setDestination('');
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-white rounded-lg shadow-xl overflow-hidden">
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Navigation className="w-8 h-8" />
            <div>
              <h1 className="text-2xl font-bold">Real-time Location Tracker</h1>
              <p className="text-blue-100">Track your location with ETA calculations</p>
            </div>
          </div>
          <div className="flex space-x-2">
            {!isTracking ? (
              <button
                onClick={startTracking}
                className="bg-white text-blue-600 px-4 py-2 rounded-lg font-semibold hover:bg-blue-50 transition-colors flex items-center space-x-2"
              >
                <MapPin className="w-4 h-4" />
                <span>Start Tracking</span>
              </button>
            ) : (
              <button
                onClick={stopTracking}
                className="bg-red-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-600 transition-colors flex items-center space-x-2"
              >
                <div className="w-4 h-4 bg-white rounded-full"></div>
                <span>Stop Tracking</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 bg-gray-50 border-b">
        <div className="mb-4">
          <div className="flex space-x-2">
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleDestinationSubmit(e)}
              placeholder="Enter destination name"
              className="border px-4 py-2 rounded-lg flex-1"
            />
            <button
              onClick={handleDestinationSubmit}
              className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
            >
              Route
            </button>
            {routingControl && (
              <button
                onClick={clearRoute}
                className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${isTracking ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></div>
              <span className="font-semibold">Status</span>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {isTracking ? 'Tracking Active' : 'Tracking Inactive'}
            </p>
          </div>

          <div className="bg-white p-4 rounded-lg shadow-sm">
            <div className="flex items-center space-x-2">
              <MapPin className="w-4 h-4 text-blue-500" />
              <span className="font-semibold">Accuracy</span>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {accuracy ? `±${Math.round(accuracy)}m` : 'No data'}
            </p>
          </div>

          <div className="bg-white p-4 rounded-lg shadow-sm">
            <div className="flex items-center space-x-2">
              <RefreshCw className="w-4 h-4 text-green-500" />
              <span className="font-semibold">Last Update</span>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {lastUpdate ? lastUpdate.toLocaleTimeString() : 'Never'}
            </p>
          </div>
        </div>

        {routeInfo && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-blue-500">
              <div className="flex items-center space-x-2">
                <Route className="w-4 h-4 text-blue-500" />
                <span className="font-semibold">Distance</span>
              </div>
              <p className="text-lg font-bold text-gray-800 mt-1">
                {formatDistance(routeInfo.distance)}
              </p>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-green-500">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-green-500" />
                <span className="font-semibold">Travel Time</span>
              </div>
              <p className="text-lg font-bold text-gray-800 mt-1">
                {formatTime(routeInfo.time)}
              </p>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-purple-500">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-purple-500" />
                <span className="font-semibold">ETA</span>
              </div>
              <p className="text-lg font-bold text-gray-800 mt-1">
                {eta ? eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Calculating...'}
              </p>
            </div>
          </div>
        )}

        {location && (
          <div className="mt-4 bg-white p-4 rounded-lg shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">Current Coordinates</h3>
                <p className="text-sm text-gray-600">
                  Lat: {location.lat.toFixed(6)}, Lng: {location.lng.toFixed(6)}
                </p>
              </div>
              <button
                onClick={centerOnLocation}
                className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 transition-colors flex items-center space-x-1"
              >
                <Navigation className="w-3 h-3" />
                <span>Center</span>
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg flex items-center space-x-2">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <div className="relative">
        <div
          ref={mapRef}
          className="w-full h-96 bg-gray-200"
          style={{ minHeight: '400px' }}
        >
          {!location && !isTracking && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
              <div className="text-center text-gray-500">
                <MapPin className="w-12 h-12 mx-auto mb-2" />
                <p>Click "Start Tracking" to see your location</p>
              </div>
            </div>
          )}
        </div>

        {isTracking && (
          <div className="absolute top-4 right-4">
            <div className="bg-green-500 text-white px-3 py-1 rounded-full text-sm flex items-center space-x-1 shadow-lg">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              <span>Live</span>
            </div>
          </div>
        )}

        {eta && (
          <div className="absolute top-4 left-4">
            <div className="bg-purple-500 text-white px-3 py-2 rounded-lg shadow-lg">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4" />
                <div>
                  <div className="text-xs opacity-90">ETA</div>
                  <div className="font-bold">
                    {eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-6 bg-gray-50">
        <div className="text-sm text-gray-600 space-y-2">
          <p><strong>Features:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Real-time location tracking with high accuracy</li>
            <li>Visual accuracy indicator (blue circle)</li>
            <li>Route planning with distance and time calculations</li>
            <li>Estimated Time of Arrival (ETA) display</li>
            <li>Live status updates and coordinates</li>
            <li>Map centering and navigation controls</li>
          </ul>
          <p className="mt-4 text-xs text-gray-500">
            Note: Location access permission required. Accuracy depends on your device's GPS capabilities. ETA calculations are based on routing data and may vary with real-time traffic conditions.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RealTimeLocationMap;