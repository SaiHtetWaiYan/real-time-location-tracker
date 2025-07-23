import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import 'leaflet-routing-machine';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { MapPin, Navigation, RefreshCw, AlertCircle, Clock, Route, Plus, Trash2, Move, Zap } from 'lucide-react';

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
  const [waypoints, setWaypoints] = useState([]);
  const [routingControl, setRoutingControl] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [eta, setEta] = useState(null);
  const [newWaypoint, setNewWaypoint] = useState('');
  const [isOptimizing, setIsOptimizing] = useState(false);

  const initializeMap = () => {
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current).setView([13.7563, 100.5018], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(mapInstanceRef.current);

      // Add click handler to add waypoints by clicking on map
      mapInstanceRef.current.on('click', (e) => {
        if (waypoints.length < 10) { // Limit to 10 waypoints
          addWaypointFromCoords(e.latlng.lat, e.latlng.lng, `Point ${waypoints.length + 1}`);
        }
      });
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
      markerRef.current = L.marker([lat, lng], {
        icon: L.divIcon({
          className: 'current-location-marker',
          html: '<div style="background: #ef4444; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px rgba(239, 68, 68, 0.5);"></div>',
          iconSize: [12, 12],
          iconAnchor: [6, 6]
        })
      }).addTo(map);
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

    // Update route if waypoints exist
    if (waypoints.length > 0) {
      updateRoute();
    }
  };

  const addWaypointFromCoords = (lat, lng, name) => {
    const newWaypoint = {
      id: Date.now(),
      name: name,
      lat: lat,
      lng: lng
    };
    setWaypoints(prev => [...prev, newWaypoint]);
  };

  const addWaypointFromSearch = async () => {
    if (!newWaypoint.trim()) return;

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(newWaypoint)}`
      );
      const data = await res.json();

      if (data && data.length > 0) {
        const result = data[0];
        const waypoint = {
          id: Date.now(),
          name: newWaypoint,
          lat: parseFloat(result.lat),
          lng: parseFloat(result.lon)
        };
        setWaypoints(prev => [...prev, waypoint]);
        setNewWaypoint('');
        setError(null);
      } else {
        setError('Location not found.');
      }
    } catch (err) {
      setError('Failed to search location.');
    }
  };

  const removeWaypoint = (id) => {
    setWaypoints(prev => prev.filter(wp => wp.id !== id));
  };

  const moveWaypointUp = (index) => {
    if (index > 0) {
      const newWaypoints = [...waypoints];
      [newWaypoints[index], newWaypoints[index - 1]] = [newWaypoints[index - 1], newWaypoints[index]];
      setWaypoints(newWaypoints);
    }
  };

  const moveWaypointDown = (index) => {
    if (index < waypoints.length - 1) {
      const newWaypoints = [...waypoints];
      [newWaypoints[index], newWaypoints[index + 1]] = [newWaypoints[index + 1], newWaypoints[index]];
      setWaypoints(newWaypoints);
    }
  };

  // Simple optimization using nearest neighbor algorithm
  const optimizeRoute = async () => {
    if (waypoints.length < 2) return;
    
    setIsOptimizing(true);
    
    try {
      // Start from current location if available, otherwise first waypoint
      const startPoint = location || waypoints[0];
      const unvisited = location ? [...waypoints] : waypoints.slice(1);
      const optimized = location ? [] : [waypoints[0]];
      let current = startPoint;

      // Nearest neighbor algorithm
      while (unvisited.length > 0) {
        let nearestIndex = 0;
        let nearestDistance = calculateDistance(current, unvisited[0]);

        for (let i = 1; i < unvisited.length; i++) {
          const distance = calculateDistance(current, unvisited[i]);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = i;
          }
        }

        const nearest = unvisited.splice(nearestIndex, 1)[0];
        optimized.push(nearest);
        current = nearest;
      }

      setWaypoints(optimized);
      setError(null);
    } catch (err) {
      setError('Failed to optimize route.');
    } finally {
      setIsOptimizing(false);
    }
  };

  const calculateDistance = (point1, point2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (point2.lat - point1.lat) * Math.PI / 180;
    const dLon = (point2.lng - point1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const updateRoute = () => {
    if (waypoints.length === 0) return;

    if (routingControl) {
      mapInstanceRef.current.removeControl(routingControl);
    }

    const routeWaypoints = [];
    
    // Add current location as start if available
    if (location) {
      routeWaypoints.push(L.latLng(location.lat, location.lng));
    }
    
    // Add all waypoints
    waypoints.forEach(wp => {
      routeWaypoints.push(L.latLng(wp.lat, wp.lng));
    });

    if (routeWaypoints.length < 2) return;

    const control = L.Routing.control({
      waypoints: routeWaypoints,
      routeWhileDragging: false,
      addWaypoints: false,
      draggableWaypoints: false,
      show: false,
      createMarker: (i, waypoint) => {
        if (i === 0 && location) return null; // Don't create marker for current location
        
        const waypointIndex = location ? i - 1 : i;
        const isLast = i === routeWaypoints.length - 1;
        
        return L.marker(waypoint.latLng, {
          icon: L.divIcon({
            className: 'waypoint-marker',
            html: `<div style="background: ${isLast ? '#ef4444' : '#3b82f6'}; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">${waypointIndex + 1}</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          })
        });
      }
    }).addTo(mapInstanceRef.current);

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
  };

  useEffect(() => {
    if (waypoints.length > 0) {
      updateRoute();
    } else if (routingControl) {
      mapInstanceRef.current.removeControl(routingControl);
      setRoutingControl(null);
      setRouteInfo(null);
      setEta(null);
    }
  }, [waypoints]);

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

  const clearAllWaypoints = () => {
    setWaypoints([]);
  };

  return (
    <div className="w-full max-w-6xl mx-auto bg-white rounded-lg shadow-xl overflow-hidden">
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Navigation className="w-8 h-8" />
            <div>
              <h1 className="text-2xl font-bold">Multi-Point Route Planner</h1>
              <p className="text-blue-100">Add waypoints and optimize your route automatically</p>
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

      <div className="flex">
        {/* Left Panel - Waypoint Management */}
        <div className="w-1/3 p-6 bg-gray-50 border-r">
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Add Waypoint</h3>
            <div className="flex space-x-2 mb-2">
              <input
                type="text"
                value={newWaypoint}
                onChange={(e) => setNewWaypoint(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addWaypointFromSearch()}
                placeholder="Search location..."
                className="border px-3 py-2 rounded-lg flex-1 text-sm"
              />
              <button
                onClick={addWaypointFromSearch}
                className="bg-blue-500 text-white p-2 rounded-lg hover:bg-blue-600 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">Or click on the map to add waypoints</p>
            
            <div className="flex space-x-2">
              <button
                onClick={optimizeRoute}
                disabled={waypoints.length < 2 || isOptimizing}
                className="bg-green-500 text-white px-3 py-2 rounded-lg text-sm hover:bg-green-600 transition-colors flex items-center space-x-1 disabled:opacity-50 flex-1"
              >
                <Zap className="w-3 h-3" />
                <span>{isOptimizing ? 'Optimizing...' : 'Optimize Route'}</span>
              </button>
              <button
                onClick={clearAllWaypoints}
                disabled={waypoints.length === 0}
                className="bg-red-500 text-white px-3 py-2 rounded-lg text-sm hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Waypoints ({waypoints.length}/10)</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {waypoints.map((waypoint, index) => (
                <div key={waypoint.id} className="bg-white p-3 rounded-lg shadow-sm border">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${index === waypoints.length - 1 ? 'bg-red-500' : 'bg-blue-500'}`}>
                          {index + 1}
                        </div>
                        <span className="text-sm font-medium truncate">{waypoint.name}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {waypoint.lat.toFixed(4)}, {waypoint.lng.toFixed(4)}
                      </p>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => moveWaypointUp(index)}
                        disabled={index === 0}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      >
                        <Move className="w-3 h-3 transform rotate-180" />
                      </button>
                      <button
                        onClick={() => moveWaypointDown(index)}
                        disabled={index === waypoints.length - 1}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      >
                        <Move className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => removeWaypoint(waypoint.id)}
                        className="p-1 text-red-400 hover:text-red-600"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {waypoints.length === 0 && (
                <div className="text-center text-gray-400 py-8">
                  <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No waypoints added yet</p>
                </div>
              )}
            </div>
          </div>

          {/* Status Cards */}
          <div className="space-y-3">
            <div className="bg-white p-3 rounded-lg shadow-sm">
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${isTracking ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></div>
                <span className="font-semibold text-sm">Status</span>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                {isTracking ? 'Tracking Active' : 'Tracking Inactive'}
              </p>
            </div>

            <div className="bg-white p-3 rounded-lg shadow-sm">
              <div className="flex items-center space-x-2">
                <MapPin className="w-3 h-3 text-blue-500" />
                <span className="font-semibold text-sm">Accuracy</span>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                {accuracy ? `±${Math.round(accuracy)}m` : 'No data'}
              </p>
            </div>

            <div className="bg-white p-3 rounded-lg shadow-sm">
              <div className="flex items-center space-x-2">
                <RefreshCw className="w-3 h-3 text-green-500" />
                <span className="font-semibold text-sm">Last Update</span>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                {lastUpdate ? lastUpdate.toLocaleTimeString() : 'Never'}
              </p>
            </div>
          </div>
        </div>

        {/* Right Panel - Map and Route Info */}
        <div className="flex-1">
          {routeInfo && (
            <div className="p-4 bg-gray-50 border-b">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white p-3 rounded-lg shadow-sm border-l-4 border-blue-500">
                  <div className="flex items-center space-x-2">
                    <Route className="w-4 h-4 text-blue-500" />
                    <span className="font-semibold text-sm">Distance</span>
                  </div>
                  <p className="text-lg font-bold text-gray-800 mt-1">
                    {formatDistance(routeInfo.distance)}
                  </p>
                </div>

                <div className="bg-white p-3 rounded-lg shadow-sm border-l-4 border-green-500">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-green-500" />
                    <span className="font-semibold text-sm">Travel Time</span>
                  </div>
                  <p className="text-lg font-bold text-gray-800 mt-1">
                    {formatTime(routeInfo.time)}
                  </p>
                </div>

                <div className="bg-white p-3 rounded-lg shadow-sm border-l-4 border-purple-500">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-purple-500" />
                    <span className="font-semibold text-sm">ETA</span>
                  </div>
                  <p className="text-lg font-bold text-gray-800 mt-1">
                    {eta ? eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Calculating...'}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="relative">
            <div
              ref={mapRef}
              className="w-full bg-gray-200"
              style={{ height: '600px' }}
            >
              {waypoints.length === 0 && !isTracking && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                  <div className="text-center text-gray-500">
                    <MapPin className="w-12 h-12 mx-auto mb-2" />
                    <p>Click on the map or search to add waypoints</p>
                    <p className="text-sm mt-1">Start tracking to see your location</p>
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

            {location && (
              <div className="absolute bottom-4 right-4">
                <button
                  onClick={centerOnLocation}
                  className="bg-blue-500 text-white px-3 py-2 rounded-lg hover:bg-blue-600 transition-colors flex items-center space-x-1 shadow-lg"
                >
                  <Navigation className="w-4 h-4" />
                  <span>Center on Me</span>
                </button>
              </div>
            )}
          </div>

          {error && (
            <div className="p-4 bg-red-100 border border-red-400 text-red-700 flex items-center space-x-2">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>

      <div className="p-6 bg-gray-50">
        <div className="text-sm text-gray-600 space-y-2">
          <p><strong>Features:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Add waypoints by searching locations or clicking on the map</li>
            <li>Automatic route optimization using nearest neighbor algorithm</li>
            <li>Drag waypoints up/down to reorder the route manually</li>
            <li>Real-time location tracking with route updates</li>
            <li>Distance, travel time, and ETA calculations</li>
            <li>Support for up to 10 waypoints per route</li>
          </ul>
          <p className="mt-4 text-xs text-gray-500">
            Note: Location access permission required. Route optimization uses a simple nearest neighbor algorithm for best performance. ETA calculations are estimates and may vary with real-time traffic conditions.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RealTimeLocationMap;