import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, RefreshCw, AlertCircle } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const RealTimeLocationMap = () => {
  const [location, setLocation] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [error, setError] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const watchIdRef = useRef(null);

  useEffect(() => {
    if (mapRef.current && !mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current).setView([0, 0], 2);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(mapInstanceRef.current);

      markerRef.current = L.divIcon({
        className: 'custom-marker',
        html: '<div class="w-6 h-6 bg-blue-500 border-2 border-white rounded-full shadow-lg animate-pulse"></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
    }

    return () => {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const startTracking = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      return;
    }

    setIsTracking(true);
    setError(null);

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 1000,
    };

    navigator.geolocation.getCurrentPosition(
      updateLocation,
      (err) => {
        setError(`Error getting location: ${err.message}`);
        setIsTracking(false);
      },
      options
    );

    watchIdRef.current = navigator.geolocation.watchPosition(
      updateLocation,
      (err) => {
        setError(`Error tracking location: ${err.message}`);
        setIsTracking(false);
      },
      options
    );
  };

  const stopTracking = () => {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
  };

  const updateLocation = (position) => {
    const { latitude, longitude, accuracy } = position.coords;
    const newLocation = { lat: latitude, lng: longitude };

    setLocation(newLocation);
    setAccuracy(accuracy);
    setLastUpdate(new Date());

    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([latitude, longitude], 16);

      mapInstanceRef.current.eachLayer((layer) => {
        if (layer instanceof L.Marker || layer instanceof L.Circle) {
          mapInstanceRef.current.removeLayer(layer);
        }
      });

      L.marker([latitude, longitude], {
        icon: markerRef.current,
      }).addTo(mapInstanceRef.current);

      L.circle([latitude, longitude], {
        radius: accuracy,
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.1,
        weight: 2,
      }).addTo(mapInstanceRef.current);
    }
  };

  const centerOnLocation = () => {
    if (location && mapInstanceRef.current) {
      mapInstanceRef.current.setView([location.lat, location.lng], 16);
    }
  };

  // === JSX return remains unchanged ===
  return (
    <div className="w-full max-w-4xl mx-auto bg-white rounded-lg shadow-xl overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Navigation className="w-8 h-8" />
            <div>
              <h1 className="text-2xl font-bold">Real-time Location Tracker</h1>
              <p className="text-blue-100">Track your location with high accuracy</p>
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

      {/* Status Panel */}
      <div className="p-6 bg-gray-50 border-b">
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

      {/* Map Container */}
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
      </div>

      {/* Info Panel */}
      <div className="p-6 bg-gray-50">
        <div className="text-sm text-gray-600 space-y-2">
          <p><strong>Features:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Real-time location tracking with high accuracy</li>
            <li>Visual accuracy indicator (blue circle)</li>
            <li>Live status updates and coordinates</li>
            <li>Map centering and navigation controls</li>
          </ul>
          <p className="mt-4 text-xs text-gray-500">
            Note: Location access permission required. Accuracy depends on your device's GPS capabilities.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RealTimeLocationMap;
