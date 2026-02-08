// auth-handler.js
// Handles all authentication logic

import { auth, db, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, collection, doc, setDoc, getDoc } from './firebase-config.js';

// ========================================
// SIGN UP WITH EMAIL/PASSWORD
// ========================================
window.handleSignUp = async function(event) {
  event.preventDefault();
  
  const name = event.target[0].value.trim();
  const email = event.target[1].value.trim();
  const password = event.target[2].value;
  
  if (!name || !email || !password) {
    alert('Please fill in all fields');
    return;
  }
  
  if (password.length < 8) {
    alert('Password must be at least 8 characters');
    return;
  }
  
  try {
    // Create user account
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Create user profile in Firestore
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      name: name,
      email: email,
      photoURL: null,
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      tripCount: 0
    });
    
    // Store name in localStorage for quick access
    localStorage.setItem('userName', name);
    
    console.log('✅ Account created!', user);
    alert('Account created successfully! 🎉');
    
    // Redirect to homepage
    window.location.href = 'index.html';
    
  } catch (error) {
    console.error('❌ Signup error:', error);
    
    // User-friendly error messages
    let errorMessage = 'Error creating account. Please try again.';
    
    if (error.code === 'auth/email-already-in-use') {
      errorMessage = 'This email is already registered. Try signing in instead.';
    } else if (error.code === 'auth/invalid-email') {
      errorMessage = 'Please enter a valid email address.';
    } else if (error.code === 'auth/weak-password') {
      errorMessage = 'Password is too weak. Use at least 8 characters.';
    }
    
    alert(errorMessage);
  }
}

// ========================================
// SIGN IN WITH EMAIL/PASSWORD
// ========================================
window.handleSignIn = async function(event) {
  event.preventDefault();
  
  const email = event.target[0].value.trim();
  const password = event.target[1].value;
  
  if (!email || !password) {
    alert('Please fill in all fields');
    return;
  }
  
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Update last login
    await setDoc(doc(db, 'users', user.uid), {
      lastLogin: new Date().toISOString()
    }, { merge: true });
    
    // Get user name from Firestore
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) {
      localStorage.setItem('userName', userDoc.data().name);
    }
    
    console.log('✅ Signed in!', user);
    alert('Welcome back! 👋');
    
    // Redirect to homepage
    window.location.href = 'index.html';
    
  } catch (error) {
    console.error('❌ Signin error:', error);
    
    let errorMessage = 'Error signing in. Please try again.';
    
    if (error.code === 'auth/user-not-found') {
      errorMessage = 'No account found with this email. Please sign up first.';
    } else if (error.code === 'auth/wrong-password') {
      errorMessage = 'Incorrect password. Please try again.';
    } else if (error.code === 'auth/invalid-email') {
      errorMessage = 'Please enter a valid email address.';
    } else if (error.code === 'auth/user-disabled') {
      errorMessage = 'This account has been disabled.';
    }
    
    alert(errorMessage);
  }
}

// ========================================
// GOOGLE SIGN-IN
// ========================================
window.socialLogin = async function(provider) {
  if (provider !== 'google') {
    alert('Only Google sign-in is configured. Apple coming soon!');
    return;
  }
  
  const googleProvider = new GoogleAuthProvider();
  
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Check if user profile exists, if not create it
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    
    if (!userDoc.exists()) {
      // New user - create profile
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        name: user.displayName || 'Anonymous',
        email: user.email,
        photoURL: user.photoURL,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        tripCount: 0
      });
    } else {
      // Existing user - update last login
      await setDoc(doc(db, 'users', user.uid), {
        lastLogin: new Date().toISOString()
      }, { merge: true });
    }
    
    // Store name in localStorage
    localStorage.setItem('userName', user.displayName || 'Anonymous');
    
    console.log('✅ Google sign-in successful!', user);
    alert('Welcome! 🎉');
    
    // Redirect to homepage
    window.location.href = 'index.html';
    
  } catch (error) {
    console.error('❌ Google signin error:', error);
    
    let errorMessage = 'Error signing in with Google. Please try again.';
    
    if (error.code === 'auth/popup-closed-by-user') {
      errorMessage = 'Sign-in cancelled.';
    } else if (error.code === 'auth/popup-blocked') {
      errorMessage = 'Please allow popups for this site to sign in with Google.';
    }
    
    alert(errorMessage);
  }
}

// ========================================
// SIGN OUT
// ========================================
window.handleSignOut = async function() {
  const confirmLogout = confirm('Are you sure you want to sign out?');
  
  if (!confirmLogout) return;
  
  try {
    await signOut(auth);
    localStorage.removeItem('userName');
    console.log('✅ Signed out');
    alert('Signed out successfully!');
    window.location.href = 'index.html';
    
  } catch (error) {
    console.error('❌ Sign out error:', error);
    alert('Error signing out. Please try again.');
  }
}

// ========================================
// CHECK AUTH STATE ON PAGE LOAD
// ========================================
onAuthStateChanged(auth, async (user) => {
  if (user) {
    console.log('✅ User is signed in:', user.email);
    
    // Update UI to show signed-in state
    updateUIForSignedInUser(user);
    
  } else {
    console.log('❌ No user signed in');
    
    // Update UI to show signed-out state
    updateUIForSignedOutUser();
  }
});

// ========================================
// UPDATE UI BASED ON AUTH STATE
// ========================================
function updateUIForSignedInUser(user) {
  // Update sign-in button in header
  const signInBtn = document.querySelector('.signin-btn');
  if (signInBtn) {
    signInBtn.textContent = user.displayName || localStorage.getItem('userName') || 'Account';
    signInBtn.href = 'dashboard.html';
  }
  
  // Show save trip button if on itinerary page
  const saveBtn = document.querySelector('.save-trip-btn');
  if (saveBtn) {
    saveBtn.style.display = 'block';
    saveBtn.innerHTML = '💾 Save This Trip';
  }
}

function updateUIForSignedOutUser() {
  // Update sign-in button in header
  const signInBtn = document.querySelector('.signin-btn');
  if (signInBtn) {
    signInBtn.textContent = 'Sign In';
    signInBtn.href = 'auth.html';
  }
  
  // Update save trip button if on itinerary page
  const saveBtn = document.querySelector('.save-trip-btn');
  if (saveBtn) {
    saveBtn.style.display = 'block';
    saveBtn.innerHTML = '🔒 Sign In to Save';
    saveBtn.onclick = () => {
      window.location.href = 'auth.html';
    };
  }
}

console.log('✅ Auth handler loaded');
