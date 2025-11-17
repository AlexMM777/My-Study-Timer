// Firebase Session Tracking Module
import { 
  db, 
  collection, 
  addDoc, 
  getDocs, 
  updateDoc, 
  doc, 
  getDoc, 
  increment,
  query,
  where
} from './firebase-config.js';
import { getCurrentUser } from './firebase-auth.js';

// Log a completed session
export async function logSession(sessionData) {
  const user = getCurrentUser();
  if (!user) {
    console.log('User not logged in - session not saved');
    return { success: false, error: 'User not authenticated' };
  }

  try {
    const { type, durationPlanned, durationActual, completed, notes = '' } = sessionData;
    
    // Add session to Firestore
    const sessionRef = await addDoc(collection(db, 'users', user.uid, 'sessions'), {
      type: type,
      durationPlanned: durationPlanned,
      durationActual: durationActual,
      completed: completed,
      timestamp: new Date(),
      notes: notes
    });

    // Update user stats if session was completed
    if (completed) {
      await updateUserStats(user.uid, durationActual, type);
    }

    console.log('Session logged successfully:', sessionRef.id);
    return { success: true, sessionId: sessionRef.id };
  } catch (error) {
    console.error('Error logging session:', error);
    return { success: false, error: error.message };
  }
}

// Update user statistics
export async function updateUserStats(userId, durationActual, type) {
  try {
    const userDocRef = doc(db, 'users', userId);
    
    await updateDoc(userDocRef, {
      'stats.totalMinutesStudied': increment(durationActual || 0),
      'stats.totalSessionsCompleted': increment(1),
      'stats.lastSessionDate': new Date(),
      'stats.lastSessionType': type
    });

    console.log('User stats updated');
    return { success: true };
  } catch (error) {
    console.error('Error updating stats:', error);
    if (error.code === 'not-found') {
      return await createUserProfile(userId);
    }
    return { success: false, error: error.message };
  }
}

// Create user profile on first login
export async function createUserProfile(userId, userEmail = '') {
  try {
    const userDocRef = doc(db, 'users', userId);
    
    const profileData = {
      email: userEmail || getCurrentUser()?.email || '',
      createdAt: new Date(),
      stats: {
        totalMinutesStudied: 0,
        totalSessionsCompleted: 0,
        currentStreak: 0,
        lastSessionDate: null,
        lastSessionType: null
      }
    };

    await updateDoc(userDocRef, profileData).catch(async () => {
      return addDoc(collection(db, 'users'), {
        uid: userId,
        ...profileData
      });
    });

    return { success: true };
  } catch (error) {
    console.error('Error creating user profile:', error);
    return { success: false, error: error.message };
  }
}

// Get user's session history
export async function getUserSessions(userId, limit = 100) {
  try {
    const sessionsRef = collection(db, 'users', userId, 'sessions');
    const querySnapshot = await getDocs(sessionsRef);
    
    const sessions = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.timestamp?.toDate) {
        data.timestamp = data.timestamp.toDate();
      }
      sessions.push({ id: docSnap.id, ...data });
    });

    sessions.sort((a, b) => {
      const timeA = a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp);
      const timeB = b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp);
      return timeB - timeA;
    });

    return { success: true, sessions: sessions.slice(0, limit) };
  } catch (error) {
    console.error('Error fetching sessions:', error);
    return { success: false, error: error.message, sessions: [] };
  }
}

// Get user statistics
export async function getUserStats(userId) {
  try {
    const userDocRef = doc(db, 'users', userId);
    const docSnap = await getDoc(userDocRef);
    
    if (docSnap.exists()) {
      return { success: true, stats: docSnap.data().stats || {} };
    }
    return { success: false, stats: {} };
  } catch (error) {
    console.error('Error fetching stats:', error);
    return { success: false, error: error.message, stats: {} };
  }
}

// Get session statistics for a date range
export async function getSessionStatsByDateRange(userId, startDate, endDate) {
  try {
    const sessionsRef = collection(db, 'users', userId, 'sessions');
    const querySnapshot = await getDocs(sessionsRef);
    
    let totalMinutes = 0;
    let sessionCount = 0;
    const sessionsByType = { work: 0, shortBreak: 0, longBreak: 0 };

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      let timestamp = data.timestamp;
      if (timestamp?.toDate) {
        timestamp = timestamp.toDate();
      } else {
        timestamp = new Date(timestamp);
      }

      if (timestamp >= startDate && timestamp <= endDate) {
        if (data.completed) {
          totalMinutes += data.durationActual || 0;
          sessionCount += 1;
          sessionsByType[data.type] = (sessionsByType[data.type] || 0) + 1;
        }
      }
    });

    return { success: true, data: { totalMinutes, sessionCount, sessionsByType } };
  } catch (error) {
    console.error('Error fetching session stats:', error);
    return { success: false, error: error.message };
  }
}
