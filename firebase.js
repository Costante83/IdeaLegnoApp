// firebase.js
// ATTENZIONE: sostituisci questi valori con i tuoi del Project Settings
const firebaseConfig = {
  apiKey: "TUO_API_KEY",
  authDomain: "TUO_DOMINIO.firebaseapp.com",
  projectId: "ID_PROGETTO",
  storageBucket: "ID_PROGETTO.appspot.com",
  messagingSenderId: "XXXXX",
  appId: "1:XXXXX:web:YYYYY"
};

// Import dinamico (il file è caricato <script> non-module, usiamo dynamic import)
(async () => {
  const [{ initializeApp }, { getAuth, signInWithEmailAndPassword, onAuthStateChanged },
         { getFirestore, collection, doc, setDoc, getDoc, onSnapshot, query, where, updateDoc, addDoc, deleteDoc, serverTimestamp },
         { getStorage, ref, uploadBytes, getDownloadURL, deleteObject }] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js'),
    import('https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js')
  ]);

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db   = getFirestore(app);
  const st   = getStorage(app);

  // --- AUTH minimal (login "silenzioso" con test user; sostituisci con il tuo flusso) ---
  // Puoi anche creare una piccola form di login nell’app; per prova:
  window.FirebaseAuth = {
    login: (email, pass) => signInWithEmailAndPassword(auth, email, pass),
    onChange: (cb) => onAuthStateChanged(auth, cb),
  };

  // Collezione "jobs" (commesse)
  const jobsCol = collection(db, 'jobs');

  // ==== API REMOTE ====
  window.Remote = {
    // subscribe alla lista attivi/archivio in tempo reale
    subscribeJobs({ archived=false }, cb){
      const q = query(jobsCol, where('archived', '==', archived));
      return onSnapshot(q, (snap) => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        cb(items);
      });
    },

    // crea nuova commessa
    async createJob(job){
      const payload = {
        cliente: job.cliente,
        mobile: job.mobile,
        architetto: job.architetto||'',
        stato: job.stato||'Nuovo',
        archived: false,
        materiali: job.materiali||[],
        mancanze: job.mancanze||'',
        // i documenti NON li salviamo qui; solo metadata se vuoi
        documentsIndex: { rilievi:[], disegni:[], preventivi:[], ordini:[] },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      const docRef = await addDoc(jobsCol, payload);
      return docRef.id;
    },

    // aggiorna commessa (metadata/testo)
    async saveJob(job){
      const ref = doc(db, 'jobs', String(job.id));
      const copy = { ...job };
      delete copy.id;
      copy.updatedAt = serverTimestamp();
      return setDoc(ref, copy, { merge: true });
    },

    // elimina commessa (NB: non cancella i file nello storage qui)
    async deleteJob(id){
      const ref = doc(db, 'jobs', String(id));
      return deleteDoc(ref);
    },

    // upload documento su Storage e aggiornamento indice nel job
    async uploadDoc(jobId, cat, file){
      const path = `jobs/${jobId}/${cat}/${Date.now()}_${file.name}`;
      const sRef = ref(st, path);
      await uploadBytes(sRef, file);
      const url = await getDownloadURL(sRef);

      const jobRef = doc(db, 'jobs', String(jobId));
      const snap = await getDoc(jobRef);
      const data = snap.data();
      const idx = data?.documentsIndex || { rilievi:[], disegni:[], preventivi:[], ordini:[] };
      idx[cat] = idx[cat] || [];
      idx[cat].push({ name:file.name, type:file.type, size:file.size, url, path });
      await updateDoc(jobRef, { documentsIndex: idx, updatedAt: serverTimestamp() });
      return { url, path };
    },

    // elimina documento da Storage + indice
    async deleteDoc(jobId, cat, index){
      const jobRef = doc(db, 'jobs', String(jobId));
      const snap = await getDoc(jobRef);
      const data = snap.data();
      const idx = data?.documentsIndex || {};
      const item = idx?.[cat]?.[index];
      if (!item) return;

      // delete from storage
      if (item.path){
        try { await deleteObject(ref(st, item.path)); } catch(e){ console.warn(e); }
      }
      // remove from index
      idx[cat].splice(index,1);
      await updateDoc(jobRef, { documentsIndex: idx, updatedAt: serverTimestamp() });
    }
  };
})();
