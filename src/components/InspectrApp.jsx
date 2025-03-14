// src/components/InspectrApp.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import RequestList from './RequestList';
import RequestDetailsPanel from './RequestDetailsPanel';
import SettingsPanel from './SettingsPanel';
import eventDB from '../utils/eventDB';
import ToastNotification from './ToastNotification.jsx';

const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost';
const debugMode = typeof window !== 'undefined' && localStorage.getItem('debug') === 'true';

if (debugMode) {
  console.log('[Inspectr] Debug Mode enabled');
}

const InspectrApp = ({ apiEndpoint: initialApiEndpoint = '/api' }) => {
  const [selectedOperation, setSelectedOperation] = useState(null);
  const [currentTab, setCurrentTab] = useState('request');
  const [apiEndpoint, setApiEndpoint] = useState(initialApiEndpoint);

  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  // Registration details state.
  const [sseEndpoint, setSseEndpoint] = useState('');
  const [channelCode, setChannelCode] = useState('');
  const [channel, setChannel] = useState('');
  const [token, setToken] = useState('');
  const [expires, setExpires] = useState('');

  // Track initialization state
  const [isInitialized, setIsInitialized] = useState(false);

  const [toast, setToast] = useState(null);

  const pageSize = 100;
  const [page, setPage] = useState(1);

  const [sortField, setSortField] = useState('time');
  const [sortDirection, setSortDirection] = useState('desc');
  const [filters, setFilters] = useState({});

  // Reconnection handling
  const wasConnectedRef = useRef(false);
  const registrationRetryCountRef = useRef(0);
  const reRegistrationFailedRef = useRef(false);
  const maxRegistrationRetries = 6;
  const retryDelay = 5000; // milliseconds

  // Live query: get the events for the current page.
  const operations = useLiveQuery(() => {
    // console.log('[Inspectr] filters', filters);
    return eventDB.queryEvents({
      sort: { field: sortField, order: sortDirection },
      filters,
      page,
      pageSize
    });
  }, [page, sortField, sortDirection, filters]);

  // Live query to get total count.
  const totalCount = useLiveQuery(() => eventDB.db.events.count(), []);
  const totalPages = totalCount ? Math.ceil(totalCount / pageSize) : 1;

  /**
   * 🏁 Step 1: Load credentials from localStorage on mount
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Read query parameters using URLSearchParams
    const urlParams = new URLSearchParams(window.location.search);
    const queryChannelCode = urlParams.get('channelCode');
    const queryChannel = urlParams.get('channel');
    const queryToken = urlParams.get('token');

    // Query parameters take precedence
    if (queryChannelCode || queryChannel || queryToken) {
      console.log('🔍 Found credentials in query params');

      if (queryChannelCode) {
        setChannelCode(queryChannelCode);
        localStorage.setItem('channelCode', queryChannelCode);
      }

      if (queryChannel) {
        setChannel(queryChannel);
        localStorage.setItem('channel', queryChannel);
      }

      if (queryToken) {
        setToken(queryToken);
        localStorage.setItem('token', queryToken);
      }

      // Update the URL without reloading the page
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}${urlParams.toString() ? '?' + urlParams.toString() : ''}`
      );
    } else {
      // Otherwise, check localStorage
      const storedChannelCode = localStorage.getItem('channelCode');
      const storedChannel = localStorage.getItem('channel');
      const storedToken = localStorage.getItem('token');

      if (storedChannelCode && storedChannel && storedToken) {
        console.log('✅ Using stored credentials from localStorage');
        setChannelCode(storedChannelCode);
        setChannel(storedChannel);
        setToken(storedToken);
      } else if (isLocalhost) {
        console.log('🔄 Fetching /app/config (Localhost, No credentials found)');
        fetch('/app/config')
          .then((res) => res.json())
          .then((result) => {
            if (result?.token && result?.sse_endpoint && result?.channel_code) {
              console.log('✅ Loaded from /app/config:', result);

              setChannelCode(result.channel_code);
              localStorage.setItem('channelCode', result.channel_code);

              setChannel(result.channel);
              localStorage.setItem('channel', result.channel);

              setToken(result.token);
              localStorage.setItem('token', result.token);

              setSseEndpoint(result.sse_endpoint);
              localStorage.setItem('sseEndpoint', result.sse_endpoint);
            }
          })
          .catch((err) => console.error('❌ Failed to load /app/config:', err));
      }
    }

    setIsInitialized(true);
  }, []);

  /**
   * 🏁 Step 2: When `isInitialized` is true, register using stored credentials
   */
  useEffect(() => {
    if (!isInitialized) return;
    console.log('🔄 Auto-registering with stored credentials:', channel, channelCode);

    if (channel && channelCode) {
      handleRegister(channelCode, channel);
    } else {
      console.log('⚠️ Missing credentials for auto-registration, skipping.');
    }
  }, [isInitialized, channel, channelCode]);

  // Registration handler.
  const handleRegister = async (
    newChannelCode = channelCode,
    newChannel = channel,
    newToken = token,
    showNotification
  ) => {
    try {
      // Construct request body
      let requestBody = {};
      if (newChannelCode && newChannel) {
        requestBody = { channel: newChannel, channel_code: newChannelCode };
      } else if (newToken) {
        requestBody = { token: newToken };
      }

      console.log('📤 Registering with:', requestBody);

      const response = await fetch(`${apiEndpoint}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-inspectr-client': 'inspectr-app'
        },
        body: JSON.stringify(requestBody)
      });

      const result = await response.json();

      if (result?.token && result?.sse_endpoint && result?.channel_code) {
        console.log('✅ Registration successful');
        registrationRetryCountRef.current = 0;
        reRegistrationFailedRef.current = false;

        setChannelCode(result.channel_code);
        localStorage.setItem('channelCode', result.channel_code);
        setChannel(result.channel);
        localStorage.setItem('channel', result.channel);
        setToken(result.token);
        localStorage.setItem('token', result.token);
        setExpires(result.expires);
        localStorage.setItem('expires', result.expires);
        setSseEndpoint(result.sse_endpoint);
        localStorage.setItem('sseEndpoint', result.sse_endpoint);

        if (showNotification) {
          setToast({
            message: 'Registration Successful',
            subMessage: 'Your channel and access code have been registered.'
          });
        }
        // Update the connection status.
        setConnectionStatus('connected');
        return true;
      } else {
        console.error('❌ Registration failed:', result);
        setToast({
          message: 'Registration Failed',
          subMessage: 'Please check your channel and access code.',
          type: 'error'
        });
        throw new Error('Registration failed');
      }
    } catch (error) {
      console.error('❌ Registration error:', error);
      setToast({
        message: 'Registration Error',
        subMessage: 'An error occurred during registration.',
        type: 'error'
      });
      throw error;
    }
  };

  const attemptReRegistration = () => {
    if (registrationRetryCountRef.current < maxRegistrationRetries) {
      registrationRetryCountRef.current += 1;
      console.log(
        `🔄 Attempting re-registration (${registrationRetryCountRef.current}/${maxRegistrationRetries}) in ${
          retryDelay / 1000
        } seconds...`
      );
      setTimeout(async () => {
        try {
          await handleRegister();
        } catch (error) {
          console.log('❌ Re-registration attempt failed:', error);
          // Try again recursively.
          attemptReRegistration();
        }
      }, retryDelay);
    } else {
      console.log(`❌ Re-registration failed after ${maxRegistrationRetries} attempts. Giving up.`);
      registrationRetryCountRef.current = 0;
      reRegistrationFailedRef.current = true; // Prevent further attempts
      // Set final connection status to "disconnected"
      setConnectionStatus('disconnected');
    }
  };

  // Automatically trigger registration when a channel is present and token is not yet set.
  // useEffect(() => {
  //   if (localStorageLoaded) {
  //     if (channel && channelCode) {
  //       console.log('Automatically trigger reregistration', channel, channelCode);
  //       handleRegister(channelCode, channel);
  //     } else {
  //       console.log('Automatically trigger new registration');
  //       handleRegister();
  //     }
  //   }
  // }, [localStorageLoaded, channel, channelCode]);

  // Connect to SSE when the component mounts.
  useEffect(() => {
    if (!sseEndpoint) return;
    const generateId = () => `req-${Math.random().toString(36).substr(2, 9)}`;
    const eventSource = new EventSource(sseEndpoint);
    console.log(`🔄 SSE connecting with ${sseEndpoint}`);

    eventSource.onopen = () => {
      console.log('📡️ SSE connection opened.');
      wasConnectedRef.current = true;
      setConnectionStatus('connected');
    };

    eventSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (debugMode) {
          console.log('[Inspectr] Received event:', event);
        }
        // Update the list and, if it's the first event, select it.
        if (!event.id) event.id = generateId();

        // Save the incoming event to the DB.
        eventDB.upsertEvent(event).catch((err) => console.error('Error saving event to DB:', err));
      } catch (error) {
        console.error('Error parsing SSE Inspectr data:', error);
      }
    };

    eventSource.onerror = (err) => {
      console.error('❌ SSE connection error:', err);
      wasConnectedRef.current = false;
      setConnectionStatus('reconnecting');

      if (reRegistrationFailedRef.current) {
        console.log('❌ Maximum re-registration attempts reached. Closing EventSource.');
        setConnectionStatus('disconnected');
        eventSource.close();
        return;
      }

      // Start the re-registration retry loop if not already in progress.
      if (!reRegistrationFailedRef.current && registrationRetryCountRef.current === 0) {
        console.log('🔄 Starting re-registration retry loop due to SSE error.');
        attemptReRegistration();
      }
      // The EventSource will try to reconnect automatically.
    };

    return () => {
      console.log('Closing SSE EventSource connection');
      eventSource.close();
      setConnectionStatus('disconnected');
    };
  }, [sseEndpoint]); // Run only once on mount

  // If no operation is selected but there are operations, select the first one.
  useEffect(() => {
    if (!selectedOperation && operations && operations.length > 0) {
      setSelectedOperation(operations[0]);
    }
  }, [operations, selectedOperation]);

  // Clear all operations.
  const clearOperations = () => {
    setSelectedOperation(null);
    eventDB.clearEvents().catch((err) => console.error('Error clearing events from DB:', err));
  };

  // Clear only the operations matching the active filters.
  const clearFilteredOperations = async () => {
    try {
      // Query all filtered operations using a very high pageSize.
      const filteredOperations = await eventDB.queryEvents({
        filters,
        sort: { field: 'time', order: 'desc' },
        page: 1,
        pageSize: Number.MAX_SAFE_INTEGER
      });
      await Promise.all(filteredOperations.map((record) => eventDB.deleteEvent(record.id)));
      if (
        selectedOperation &&
        filteredOperations.some((record) => record.id === selectedOperation.id)
      ) {
        setSelectedOperation(null);
      }
    } catch (error) {
      console.error('Error clearing filtered operations:', error);
    }
  };

  // Remove a single request.
  const removeOperation = (opId) => {
    if (selectedOperation && (selectedOperation.id || '') === opId) {
      setSelectedOperation(null);
    }
    eventDB.deleteEvent(opId).catch((err) => console.error('Error deleting event from DB:', err));
  };

  return (
    <div className="flex flex-col h-screen">
      <div className="flex flex-grow">
        {/* Left Panel */}
        <div className="w-1/3 border-r border-gray-300 overflow-y-auto">
          <RequestList
            operations={operations || []}
            onSelect={setSelectedOperation}
            onRemove={removeOperation}
            clearOperations={clearOperations}
            clearFilteredOperations={clearFilteredOperations}
            selectedOperation={selectedOperation}
            currentPage={page}
            totalPages={totalPages}
            totalCount={totalCount || 0}
            onPageChange={setPage}
            sortField={sortField}
            sortDirection={sortDirection}
            filters={filters}
            setSortField={setSortField}
            setSortDirection={setSortDirection}
            setFilters={setFilters}
          />
        </div>

        {/* Right Panel */}
        <div className="w-2/3 p-4 h-full overflow-y-auto">
          <div className="flex flex-col h-full">
            <RequestDetailsPanel
              operation={selectedOperation}
              currentTab={currentTab}
              setCurrentTab={setCurrentTab}
            />
          </div>
        </div>
      </div>
      {/* Bottom Panel */}
      <SettingsPanel
        apiEndpoint={apiEndpoint}
        setApiEndpoint={setApiEndpoint}
        connectionStatus={connectionStatus}
        channelCode={channelCode}
        setChannelCode={setChannelCode}
        channel={channel}
        setChannel={setChannel}
        onRegister={handleRegister}
      />
      {toast && (
        <ToastNotification
          message={toast.message}
          subMessage={toast.subMessage}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default InspectrApp;
