// step counter w/ firebase auth

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Platform,
  Alert,
  TextInput,
  FlatList,
  Pressable,
  KeyboardAvoidingView,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  SafeAreaView,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { Pedometer } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';

const todayKey = () => new Date().toISOString().slice(0, 10); 
const startOfDay = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// fire base
import { initializeApp, getApps } from 'firebase/app';
import {
  initializeAuth,
  getReactNativePersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth';

// credentials (ill send)
const firebaseConfig = {
  apiKey: "AIzaSyAKVldON8OqrU5h_3Jm5kQKtElHnaNFj4Y",
  authDomain: "stepapp-9a44c.firebaseapp.com",
  projectId: "stepapp-9a44c",
  storageBucket: "stepapp-9a44c.firebasestorage.app",
  messagingSenderId: "227263979677",
  appId: "1:227263979677:web:59467b81f9cbf187883474"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// notis setup
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  if (authLoading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center' }]}> 
        <Text style={styles.title}>Loading…</Text>
      </SafeAreaView>
    );
  }

  return user ? <AuthedApp user={user} /> : <AuthScreen />;
}

function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('signin'); 
  const [busy, setBusy] = useState(false);
  const passRef = useRef(null);

  const submit = async () => {
    if (!email || !password) return Alert.alert('Missing info', 'Please enter email and password');
    setBusy(true);
    try {
      if (mode === 'signin') await signInWithEmailAndPassword(auth, email.trim(), password);
      else await createUserWithEmailAndPassword(auth, email.trim(), password);
    } catch (e) {
      Alert.alert('Auth error', e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.authCard}>
              <Text style={styles.title}>Step Counter</Text>
              <Text style={styles.sub}>Sign {mode === 'signin' ? 'in' : 'up'} to continue</Text>

              <View style={{ height: 16 }} />

              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                returnKeyType="next"
                onSubmitEditing={() => passRef.current?.focus()}
              />

              <Text style={[styles.label, { marginTop: 12 }]}>Password</Text>
              <TextInput
                ref={passRef}
                style={styles.input}
                placeholder="••••••••"
                secureTextEntry
                autoComplete="password"
                textContentType="password"
                value={password}
                onChangeText={setPassword}
                returnKeyType="go"
                onSubmitEditing={submit}
              />

              <View style={{ height: 20 }} />

              <Pressable onPress={submit} disabled={busy} style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.9 }, busy && { opacity: 0.6 }]}>
                <Text style={styles.primaryBtnText}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}</Text>
              </Pressable>

              <View style={{ height: 12 }} />

              <View style={styles.switchRow}>
                <Text style={{ color: '#555' }}>{mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}</Text>
                <Pressable onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
                  <Text style={styles.link}>{mode === 'signin' ? 'Create one' : 'Sign in'}</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function AuthedApp({ user }) {
  const [isAvailable, setIsAvailable] = useState(null);
  const [todaySteps, setTodaySteps] = useState(0);
  const [goal, setGoal] = useState(8000);
  const [inputGoal, setInputGoal] = useState('8000');
  const [history, setHistory] = useState([]); 
  const subRef = useRef(null);

  useEffect(() => {
    (async () => {
      const g = await AsyncStorage.getItem(`goal:${user.uid}`);
      if (g) {
        setGoal(Number(g));
        setInputGoal(String(g));
      }
      const h = await AsyncStorage.getItem(`history:${user.uid}`);
      if (h) setHistory(JSON.parse(h));
    })();
  }, [user?.uid]);

  // history once a change is made
  useEffect(() => {
    AsyncStorage.setItem(`history:${user.uid}`, JSON.stringify(history));
  }, [history, user?.uid]);
  useEffect(() => {
    AsyncStorage.setItem(`goal:${user.uid}`, String(goal));
  }, [goal, user?.uid]);

    // pedmotier avialability + initial count
  useEffect(() => {
    (async () => {
      const avail = await Pedometer.isAvailableAsync();
      setIsAvailable(avail);
      if (!avail) return;
      const result = await Pedometer.getStepCountAsync(startOfDay(), new Date());
      setTodaySteps(result?.steps ?? 0);
    })();
  }, []);

  // live updates
  useEffect(() => {
    if (!isAvailable) return;
    subRef.current = Pedometer.watchStepCount(() => {
      Pedometer.getStepCountAsync(startOfDay(), new Date()).then((r) => setTodaySteps(r.steps));
    });
    return () => subRef.current && subRef.current.remove();
  }, [isAvailable]);

  // synv daily history
  useEffect(() => {
    const key = todayKey();
    setHistory((prev) => {
      if (prev.find((x) => x.date === key)) return prev.map((x) => (x.date === key ? { ...x, steps: todaySteps } : x));
      return [...prev, { date: key, steps: todaySteps }];
    });
  }, [todaySteps]);

  // manual refresh for demo
  const manualRefresh = async () => {
    try {
      const result = await Pedometer.getStepCountAsync(startOfDay(), new Date());
      setTodaySteps(result?.steps ?? 0);
    } catch (e) {
      Alert.alert('Refresh failed', String(e.message || e));
    }
  };

  // noti test
  const scheduleReminder = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Enable notifications to get reminders.');
      return;
    }
    const target = new Date();
    target.setHours(20, 0, 0, 0);
    if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Walk break?',
        body: `You're at ${todaySteps} / ${goal} steps. A short walk would smash your goal!`,
        data: { kind: 'daily-reminder' },
      },
      trigger: { date: target },
    });
    Alert.alert('Reminder set', `We'll remind you at ${target.toLocaleTimeString()}.`);
  };

  const applyGoal = () => {
    const n = Number(inputGoal);
    if (!Number.isFinite(n) || n <= 0) return Alert.alert('Invalid goal', 'Enter a positive number');
    setGoal(n);
  };

  const sendTodayToBackend = async () => {
    try {
      const resp = await fetch('https://example.com/steps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uid, date: todayKey(), steps: todaySteps, platform: Platform.OS }),
      });
      if (!resp.ok) throw new Error('Server error');
      Alert.alert('Synced', "Today's steps sent to server.");
    } catch (e) {
      Alert.alert('Sync failed', String(e.message || e));
    }
  };

  const progress = useMemo(() => Math.min(1, todaySteps / Math.max(goal, 1)), [todaySteps, goal]);

  return (
    <SafeAreaView style={styles.container}> 
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <Text style={styles.title}>Step Counter</Text>
        <Text style={styles.sub}>Signed in as {user.email || user.uid}</Text>

        <View style={{ marginTop: 8, alignSelf: 'flex-end' }}>
          <Pressable onPress={() => signOut(auth)} style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.7 }]}>
            <Text style={[styles.link, { fontWeight: '600' }]}>Sign out</Text>
          </Pressable>
        </View>

        {isAvailable === false && <Text style={styles.warn}>Pedometer not available on this device.</Text>}

        <View style={styles.card}>
          <Text style={styles.metrics}>
            <Text style={styles.bold}>{todaySteps.toLocaleString()}</Text> steps today
          </Text>
          <Text>Goal: {goal.toLocaleString()}</Text>
          <View style={styles.barOuter} accessibilityLabel="Progress toward daily step goal">
            <View style={[styles.barInner, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={{ marginTop: 4 }}>{Math.round(progress * 100)}% of goal</Text>
        </View>

        <View style={styles.row}>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={inputGoal}
            onChangeText={setInputGoal}
            placeholder="Set daily goal"
            accessibilityLabel="Daily step goal"
          />
          <Pressable onPress={applyGoal} style={styles.secondaryBtn}><Text style={styles.secondaryBtnText}>Update Goal</Text></Pressable>
        </View>

        <View style={styles.row}>
          <Pressable onPress={manualRefresh} style={styles.secondaryBtn}><Text style={styles.secondaryBtnText}>Manual refresh</Text></Pressable>
          <Pressable onPress={scheduleReminder} style={styles.secondaryBtn}><Text style={styles.secondaryBtnText}>Schedule 8pm Reminder</Text></Pressable>
        </View>

        <View style={styles.row}>
          <Pressable onPress={sendTodayToBackend} style={styles.secondaryBtn}><Text style={styles.secondaryBtnText}>Sync today to backend</Text></Pressable>
        </View>

        <Text style={[styles.title, { marginTop: 16 }]}>History (last 7)</Text>
        <FlatList
          style={{ alignSelf: 'stretch' }}
          data={[...history].slice(-7).reverse()}
          keyExtractor={(item) => item.date}
          renderItem={({ item }) => (
            <View style={styles.historyRow}>
              <Text style={{ width: 120 }}>{item.date}</Text>
              <Text>{item.steps.toLocaleString()} steps</Text>
            </View>
          )}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 24,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center' },
  sub: { marginTop: 6, color: '#666', textAlign: 'center' },
  authScroll: { flexGrow: 1, padding: 16, alignItems: 'center', justifyContent: 'center' },
  authCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    padding: 20,
    backgroundColor: '#fff',
  },
  label: { fontSize: 13, color: '#555', marginBottom: 6 },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  primaryBtn: {
    height: 48,
    backgroundColor: '#4c8bf5',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  switchRow: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  link: { color: '#4c8bf5' },
  linkBtn: { paddingVertical: 6, paddingHorizontal: 8 },

  warn: { marginTop: 10, color: '#b00020' },
  card: { marginTop: 20, padding: 16, borderRadius: 12, backgroundColor: '#f7f7f7', width: '100%', maxWidth: 500 },
  metrics: { fontSize: 18 },
  bold: { fontWeight: '700' },
  barOuter: { marginTop: 12, height: 14, backgroundColor: '#e5e5e5', borderRadius: 8, overflow: 'hidden' },
  barInner: { height: '100%', backgroundColor: '#4c8bf5' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 12,
    alignSelf: 'stretch',
    maxWidth: 500,
  },
  secondaryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#eef2ff',
    borderRadius: 10,
  },
  secondaryBtnText: { color: '#1f2937', fontWeight: '600' },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
});
