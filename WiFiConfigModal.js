import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';

const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

// WiFi Network Item Component
const WiFiNetworkItem = React.memo(({ network, isSelected, onSelect, isScanning }) => {
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.97, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const getSignalStrength = (rssi) => {
    if (rssi >= -50) return { icon: 'wifi', color: '#10B981', strength: 'Excellent' };
    if (rssi >= -60) return { icon: 'wifi', color: '#10B981', strength: 'Good' };
    if (rssi >= -70) return { icon: 'wifi', color: '#F59E0B', strength: 'Fair' };
    return { icon: 'wifi', color: '#EF4444', strength: 'Weak' };
  };

  const signal = getSignalStrength(network.rssi);

  return (
    <AnimatedTouchable
      style={[styles.wifiNetworkItem, isSelected && styles.wifiNetworkItemSelected, animatedStyle]}
      onPress={() => onSelect(network)}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
      disabled={isScanning}
    >
      <LinearGradient
        colors={isSelected ? ['#06b6d420', '#0891b220'] : ['#1f293780', '#11182780']}
        style={styles.wifiNetworkGradient}
      >
        <View style={styles.wifiNetworkLeft}>
          <Ionicons name={signal.icon} size={24} color={signal.color} />
          <View style={styles.wifiNetworkInfo}>
            <Text style={styles.wifiNetworkName} numberOfLines={1}>
              {network.ssid}
            </Text>
            <Text style={[styles.wifiNetworkStrength, { color: signal.color }]}>
              {signal.strength} ({network.rssi} dBm)
            </Text>
          </View>
        </View>
        {network.encryption !== 'OPEN' && (
          <Ionicons name="lock-closed" size={18} color="#9ca3af" />
        )}
        {isSelected && (
          <Ionicons name="checkmark-circle" size={24} color="#06b6d4" style={{ marginLeft: 8 }} />
        )}
      </LinearGradient>
    </AnimatedTouchable>
  );
});

// Custom fetch with timeout
const fetchWithTimeout = async (url, options = {}, timeout = 30000) => {
  const controller = new AbortController();
  const { signal } = controller;
  
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

const WiFiConfigModal = ({ 
  visible, 
  onClose, 
  device,
  userId 
}) => {
  const mountedRef = useRef(true);
  const wifiScanTimerRef = useRef(null);
  const wifiListenerRef = useRef(null);
  const cleanupFunctionsRef = useRef([]);
  
  const [wifiNetworks, setWifiNetworks] = useState([]);
  const [selectedNetwork, setSelectedNetwork] = useState(null);
  const [wifiPassword, setWifiPassword] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isConfiguring, setIsConfiguring] = useState(false);

  // Modal animation
  const modalScale = useSharedValue(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (visible) {
      modalScale.value = withSpring(1, { damping: 12, stiffness: 400, mass: 0.5 });
      // Auto-scan when modal opens
      setTimeout(() => {
        if (mountedRef.current && device?.deviceId) {
          scanWifiNetworksViaHTTP(device.deviceId);
        }
      }, 500);
    } else {
      modalScale.value = withTiming(0, { duration: 150, easing: Easing.in(Easing.ease) });
    }
  }, [visible]);

  const modalAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: modalScale.value }],
    opacity: modalScale.value,
  }));

  // Comprehensive cleanup function
  const cleanupWifiListener = useCallback(() => {
    if (wifiScanTimerRef.current) {
      clearTimeout(wifiScanTimerRef.current);
      wifiScanTimerRef.current = null;
    }

    if (wifiListenerRef.current) {
      try {
        // Firebase cleanup if needed
        wifiListenerRef.current();
      } catch (error) {
        console.log('Error removing listener:', error);
      }
      wifiListenerRef.current = null;
    }

    cleanupFunctionsRef.current.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        console.log('Cleanup error:', error);
      }
    });
    cleanupFunctionsRef.current = [];
  }, []);

  // DIRECT AP - WiFi Scan via HTTP
  const scanWifiNetworksViaHTTP = useCallback(async (deviceId) => {
    if (!deviceId || isScanning || !userId) {
      console.log('Scan cancelled:', { 
        hasDevice: !!deviceId, 
        isScanning, 
        hasUser: !!userId 
      });
      return;
    }

    cleanupWifiListener();

    if (!mountedRef.current) return;

    setIsScanning(true);
    setWifiNetworks([]);

    try {
      console.log('📡 Starting Direct AP WiFi scan via HTTP');
      
      const deviceIP = '192.168.4.1';
      console.log(`🌐 Device IP: ${deviceIP}`);

      const scanUrl = `http://${deviceIP}/scan`;
      console.log(`📤 Sending HTTP GET to: ${scanUrl}`);
      
      const response = await fetchWithTimeout(scanUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }, 30000);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('📊 Scan response received:', data);

      if (data.success && data.networks && Array.isArray(data.networks)) {
        const validNetworks = data.networks
          .filter(network => network && network.ssid && network.ssid.trim() !== '')
          .sort((a, b) => (b.rssi || -100) - (a.rssi || -100));

        console.log(`✅ Found ${validNetworks.length} valid networks`);
        
        if (mountedRef.current) {
          setWifiNetworks(validNetworks);
          setIsScanning(false);
        }
      } else {
        console.log('⚠️ No networks found in response');
        if (mountedRef.current) {
          setIsScanning(false);
          Alert.alert(
            'No Networks Found',
            'No WiFi networks were detected. Please ensure the device is powered on and in setup mode.',
            [{ text: 'OK' }]
          );
        }
      }

    } catch (error) {
      console.error('❌ Direct AP WiFi scan error:', error);
      if (mountedRef.current) {
        setIsScanning(false);
        if (error.name === 'AbortError') {
          Alert.alert(
            'Scan Timeout',
            'WiFi scan timed out after 30 seconds. Please ensure:\n• Device is in AP mode\n• You are connected to device\'s WiFi\n• Device IP is 192.168.4.1',
            [{ text: 'OK' }]
          );
        } else {
          Alert.alert(
            'Scan Failed',
            `Failed to scan networks via Direct AP.\n\nError: ${error.message}\n\nPlease ensure:\n• Device is in AP mode\n• You are connected to device's WiFi\n• Device IP is 192.168.4.1`,
            [{ text: 'OK' }]
          );
        }
      }
    }
  }, [isScanning, userId, cleanupWifiListener]);

  // DIRECT AP - WiFi Configuration via HTTP
  const configureWifiViaHTTP = useCallback(async () => {
    if (!device?.deviceId || !selectedNetwork || isConfiguring || !userId) {
      Alert.alert('Error', 'Please select a network');
      return;
    }

    if (selectedNetwork.encryption !== 'OPEN' && !wifiPassword) {
      Alert.alert('Error', 'Please enter the WiFi password');
      return;
    }

    setIsConfiguring(true);

    try {
      const deviceId = device.deviceId;
      const deviceIP = '192.168.4.1';

      const configUrl = `http://${deviceIP}/configure`;
      const configData = {
        ssid: selectedNetwork.ssid,
        password: wifiPassword || ''
      };

      console.log('📤 Sending WiFi configuration via HTTP POST');
      console.log(`🌐 URL: ${configUrl}`);
      console.log(`📶 Network: ${selectedNetwork.ssid}`);

      const response = await fetchWithTimeout(configUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(configData),
      }, 60000);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('📊 Configuration response:', result);

      if (result.success) {
        console.log('✅ WiFi configuration successful!');
        
        if (mountedRef.current) {
          setIsConfiguring(false);
          
          Alert.alert(
            'WiFi Connected!',
            `Device successfully connected to "${selectedNetwork.ssid}".\n\nThe device will now connect to your WiFi network. You can monitor it from the Home screen.`,
            [
              {
                text: 'OK',
                onPress: () => {
                  if (mountedRef.current) {
                    handleClose();
                  }
                }
              }
            ]
          );
        }
      } else {
        throw new Error(result.error || 'Configuration failed');
      }

    } catch (error) {
      console.error('❌ WiFi configuration error:', error);
      if (mountedRef.current) {
        setIsConfiguring(false);
        if (error.name === 'AbortError') {
          Alert.alert(
            'Configuration Timeout',
            'WiFi configuration timed out after 60 seconds. Please check the device and try again.',
            [{ text: 'OK' }]
          );
        } else {
          Alert.alert(
            'Configuration Failed',
            `Failed to configure WiFi via Direct AP.\n\nError: ${error.message}\n\nPlease check the password and try again.`,
            [{ text: 'OK' }]
          );
        }
      }
    }
  }, [device, selectedNetwork, wifiPassword, isConfiguring, userId]);

  const handleClose = useCallback(() => {
    setSelectedNetwork(null);
    setWifiPassword('');
    setWifiNetworks([]);
    setIsScanning(false);
    setShowPassword(false);
    cleanupWifiListener();
    onClose();
  }, [onClose, cleanupWifiListener]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      cleanupWifiListener();
    };
  }, [cleanupWifiListener]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <AnimatedView style={[styles.modalContent, modalAnimatedStyle]}>
          <LinearGradient
            colors={['#1F2937', '#111827']}
            style={styles.modalGradient}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Configure WiFi (Direct AP)</Text>
              <TouchableOpacity onPress={handleClose}>
                <Ionicons name="close" size={24} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Connect to device WiFi network first, then select your home network
            </Text>

            {/* Device IP Info */}
            <View style={styles.ipInfoBox}>
              <Ionicons name="information-circle" size={20} color="#06b6d4" />
              <Text style={styles.ipInfoText}>
                Device IP: 192.168.4.1
              </Text>
            </View>

            {/* Scan Status */}
            <View style={styles.scanStatus}>
              {isScanning && (
                <View style={styles.scanningIndicator}>
                  <ActivityIndicator size="small" color="#06b6d4" />
                  <Text style={styles.scanningText}>Scanning via Direct AP...</Text>
                </View>
              )}
              {wifiNetworks.length > 0 && !isScanning && (
                <Text style={styles.networksFoundText}>
                  {wifiNetworks.length} network{wifiNetworks.length !== 1 ? 's' : ''} found
                </Text>
              )}
            </View>

            {/* Scan Button */}
            <TouchableOpacity 
              style={styles.scanButton}
              onPress={() => scanWifiNetworksViaHTTP(device?.deviceId)}
              disabled={isScanning || !device?.deviceId}
            >
              <LinearGradient
                colors={['#06b6d420', '#0891b220']}
                style={styles.scanButtonGradient}
              >
                {isScanning ? (
                  <>
                    <ActivityIndicator size="small" color="#06b6d4" style={{ marginRight: 8 }} />
                    <Text style={styles.scanButtonText}>Scanning...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="refresh" size={20} color="#06b6d4" style={{ marginRight: 8 }} />
                    <Text style={styles.scanButtonText}>Scan Networks</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* WiFi Networks List */}
            <ScrollView 
              style={styles.wifiNetworksList}
              showsVerticalScrollIndicator={false}
            >
              {wifiNetworks.length > 0 ? (
                wifiNetworks.map((network, index) => (
                  <WiFiNetworkItem
                    key={`${network.ssid}-${index}-${network.rssi}`}
                    network={network}
                    isSelected={selectedNetwork?.ssid === network.ssid}
                    onSelect={setSelectedNetwork}
                    isScanning={isScanning}
                  />
                ))
              ) : (
                <View style={styles.emptyWifiState}>
                  <Ionicons name="wifi-outline" size={48} color="#37415180" />
                  <Text style={styles.emptyWifiText}>
                    {isScanning ? 'Scanning for networks...' : 'No networks found'}
                  </Text>
                  <Text style={styles.emptyWifiSubtext}>
                    {isScanning 
                      ? 'Connecting to device via Direct AP...' 
                      : 'Ensure you are connected to device WiFi and tap "Scan Networks"'}
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Password Input */}
            {selectedNetwork && selectedNetwork.encryption !== 'OPEN' && (
              <View style={styles.passwordSection}>
                <Text style={styles.inputLabel}>WiFi Password</Text>
                <View style={styles.passwordInputContainer}>
                  <TextInput
                    style={styles.passwordInput}
                    value={wifiPassword}
                    onChangeText={setWifiPassword}
                    placeholder="Enter WiFi password"
                    placeholderTextColor="#6B7280"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity 
                    style={styles.eyeButton}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Ionicons 
                      name={showPassword ? "eye-off" : "eye"} 
                      size={22} 
                      color="#9ca3af" 
                    />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={handleClose}
              >
                <Text style={styles.cancelButtonText}>Skip WiFi</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton, 
                  styles.saveButton,
                  (!selectedNetwork || isConfiguring) && styles.disabledButton
                ]}
                onPress={configureWifiViaHTTP}
                disabled={!selectedNetwork || isConfiguring}
              >
                <LinearGradient
                  colors={['#10B981', '#059669']}
                  style={styles.saveButtonGradient}
                >
                  {isConfiguring ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.saveButtonText}>Connect</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </AnimatedView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
    borderRadius: 20,
    overflow: 'hidden',
  },
  modalGradient: {
    padding: 24,
    borderWidth: 1,
    borderColor: '#37415140',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#9ca3af',
    marginBottom: 16,
  },
  ipInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#06b6d420',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#06b6d440',
    marginBottom: 16,
  },
  ipInfoText: {
    color: '#06b6d4',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },
  scanStatus: {
    marginBottom: 16,
  },
  scanningIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#06b6d420',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#06b6d440',
  },
  scanningText: {
    color: '#06b6d4',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  networksFoundText: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    padding: 8,
  },
  scanButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  scanButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#06b6d440',
    borderRadius: 12,
  },
  scanButtonText: {
    color: '#06b6d4',
    fontSize: 15,
    fontWeight: 'bold',
  },
  wifiNetworksList: {
    maxHeight: 300,
    marginBottom: 16,
  },
  wifiNetworkItem: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  wifiNetworkItemSelected: {
    borderWidth: 2,
    borderColor: '#06b6d4',
  },
  wifiNetworkGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderWidth: 1,
    borderColor: '#37415140',
    borderRadius: 12,
  },
  wifiNetworkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  wifiNetworkInfo: {
    marginLeft: 12,
    flex: 1,
  },
  wifiNetworkName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  wifiNetworkStrength: {
    fontSize: 12,
    fontWeight: '500',
  },
  emptyWifiState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyWifiText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 12,
  },
  emptyWifiSubtext: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 6,
    textAlign: 'center',
  },
  passwordSection: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    color: '#9ca3af',
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f2937',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  passwordInput: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    color: '#fff',
  },
  eyeButton: {
    padding: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  cancelButton: {
    backgroundColor: '#1f2937',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  saveButton: {
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  saveButtonGradient: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.5,
  },
});

export default WiFiConfigModal;