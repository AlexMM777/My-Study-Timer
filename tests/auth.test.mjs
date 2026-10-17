import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signOut,
  signInWithEmailAndPassword, sendEmailVerification, applyActionCode, reload,
  sendPasswordResetEmail, confirmPasswordReset, GoogleAuthProvider, linkWithCredential } from 'firebase/auth';

test('email registration, verification, password reset and Google linking preserve the UID in the emulator', async()=>{
  const app=initializeApp({projectId:'my-study-timer',apiKey:'emulator-test'},`auth-test-${Date.now()}`);
  try {
    const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
    const email=`auth-${Date.now()}@example.test`,password='Test-Only-Local-123';
    const created=await createUserWithEmailAndPassword(auth,email,password);const uid=created.user.uid;
    await sendEmailVerification(created.user);
    const codes=await fetch('http://127.0.0.1:9099/emulator/v1/projects/my-study-timer/oobCodes').then(r=>r.json());
    const verification=codes.oobCodes.find(x=>x.email===email&&x.requestType==='VERIFY_EMAIL');
    assert.ok(verification);await applyActionCode(auth,verification.oobCode);await reload(auth.currentUser);assert.equal(auth.currentUser.emailVerified,true);
    await signOut(auth);await signInWithEmailAndPassword(auth,email,password);assert.equal(auth.currentUser.uid,uid);
    const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
    const idToken=`${encode({alg:'none'})}.${encode({sub:uid,email,email_verified:true,iss:'https://accounts.google.com',aud:'emulator',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})}.`;
    await linkWithCredential(auth.currentUser,GoogleAuthProvider.credential(idToken));
    assert.equal(auth.currentUser.uid,uid);assert.ok(auth.currentUser.providerData.some(x=>x.providerId==='google.com'));
    await signOut(auth);await sendPasswordResetEmail(auth,email);
    const resets=await fetch('http://127.0.0.1:9099/emulator/v1/projects/my-study-timer/oobCodes').then(r=>r.json());
    const reset=resets.oobCodes.find(x=>x.email===email&&x.requestType==='PASSWORD_RESET');
    await confirmPasswordReset(auth,reset.oobCode,'Test-Only-Changed-456');
    await signInWithEmailAndPassword(auth,email,'Test-Only-Changed-456');assert.equal(auth.currentUser.uid,uid);
  } finally { await deleteApp(app); }
});
