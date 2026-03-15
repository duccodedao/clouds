/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  auth, db, storage, googleProvider, 
  signInWithPopup, signOut, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, updatePassword,
  EmailAuthProvider, reauthenticateWithCredential,
  doc, getDoc, setDoc, updateDoc, collection, query, where, onSnapshot, addDoc, deleteDoc, serverTimestamp, increment, getDocs, writeBatch, orderBy, limit,
  ref, uploadBytesResumable, getDownloadURL, deleteObject
} from './firebase';
import { 
  Search, HardDrive, Image as ImageIcon, Share2, Trash2, Star, Settings, 
  Plus, Folder, File, FileText, Video, Music, MoreVertical, Download, 
  Eye, X, Send, Cpu, Shield, Zap, Crown, LogOut, Menu, ChevronRight,
  LayoutGrid, List, Filter, ArrowUp, Clock, User, CheckCircle2, AlertCircle,
  RotateCcw, Check, Bell, Monitor, Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { useDropzone } from 'react-dropzone';
import confetti from 'canvas-confetti';
import { analyzeImage, chatWithFile, semanticSearch } from './services/aiService';
import { getDocFromServer } from 'firebase/firestore';
import { UserData, FileData, FolderData, UpgradeRequest, LoginHistory, NotificationData, GithubConfig } from './types';
import { translations } from './translations';

// --- Constants & Types ---

const ADMIN_EMAILS = ["sonlyhongduc@gmail.com"];

const STORAGE_TIERS = {
  USER: { limit: 1024 * 1024 * 1024, label: 'Standard', color: 'bg-slate-500', price: 0 },
  VIP: { limit: 10 * 1024 * 1024 * 1024, label: 'VIP', color: 'bg-indigo-500', price: 9.99 },
  SVIP: { limit: 50 * 1024 * 1024 * 1024, label: 'SVIP', color: 'bg-purple-500', price: 19.99 },
  VVIP: { limit: 200 * 1024 * 1024 * 1024, label: 'VVIP', color: 'bg-amber-500', price: 49.99 },
  ENTERPRISE: { limit: 1000 * 1024 * 1024 * 1024, label: 'Enterprise', color: 'bg-emerald-500', price: 99.99 },
};

const ADMIN_UIDS = ["VYIs9XHLR9RMStwtcdwMrOIo33w1"];

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: string;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}


export default function App() {
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('my-files');
  const [files, setFiles] = useState<FileData[]>([]);
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewFile, setPreviewFile] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{role: string, text: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [requests, setRequests] = useState<UpgradeRequest[]>([]);
  const [allUsers, setAllUsers] = useState<UserData[]>([]);
  const [githubConfig, setGithubConfig] = useState<GithubConfig>({ 
    token: '', 
    username: '', 
    repo: '', 
    projectName: '', 
    branch: 'main' 
  });
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [loginHistory, setLoginHistory] = useState<LoginHistory[]>([]);
  const [allLoginHistory, setAllLoginHistory] = useState<LoginHistory[]>([]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    const q = query(collection(db, 'login_history'), orderBy('timestamp', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAllLoginHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LoginHistory)));
    });
    return () => unsubscribe();
  }, [user, isAdmin]);
  const [showLanding, setShowLanding] = useState(true);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [adminNotifTitle, setAdminNotifTitle] = useState('');
  const [adminNotifMessage, setAdminNotifMessage] = useState('');
  const [isSendingNotif, setIsSendingNotif] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [language, setLanguage] = useState<'vi' | 'en'>('vi');
  const [isMobile, setIsMobile] = useState(false);

  // Auth & Security State
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  useEffect(() => {
    const savedEmail = localStorage.getItem('remembered_email');
    if (savedEmail) {
      setAuthEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) setIsSidebarOpen(false);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    // PWA Install Prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    });

    // Notification Permission
    if ("Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const addToast = (message: string, type: 'SUCCESS' | 'ERROR' | 'INFO' = 'INFO') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  // Login History Recorder with Location
  const recordLoginHistory = async (uid: string) => {
    try {
      let locationData = undefined;
      
      if ("geolocation" in navigator) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
          });
          locationData = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };
        } catch (e) {
          console.log("Location access denied or timed out");
        }
      }

      const historyRef = collection(db, 'login_history');
      await addDoc(historyRef, {
        uid,
        timestamp: new Date().toISOString(),
        device: navigator.userAgent,
        ip: 'hidden',
        location: locationData
      });
    } catch (error) {
      console.error("Failed to record login history", error);
    }
  };

  const isFeatureUnlocked = (feature: string) => {
    if (isAdmin) return true;
    const level = userData?.vipLevel || 'USER';
    switch (feature) {
      case 'AI_TAGS':
      case 'OCR':
        return ['VIP', 'SVIP', 'VVIP', 'ENTERPRISE'].includes(level);
      case 'AI_CHAT':
        return ['SVIP', 'VVIP', 'ENTERPRISE'].includes(level);
      case 'SEMANTIC_SEARCH':
        return ['VVIP', 'ENTERPRISE'].includes(level);
      default:
        return true;
    }
  };

  const handleSaveGithubConfig = async () => {
    try {
      await setDoc(doc(db, 'config', 'github'), {
        ...githubConfig,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid
      });
      alert(t('config_saved'));
    } catch (error) {
      handleError(error, OperationType.WRITE, 'config/github');
    }
  };

  const handleSendAdminNotification = async () => {
    if (!adminNotifTitle || !adminNotifMessage) return;
    setIsSendingNotif(true);
    try {
      const usersRef = collection(db, 'users');
      const usersSnap = await getDocs(usersRef);
      
      const batch = writeBatch(db);
      usersSnap.forEach((userDoc) => {
        const notifRef = doc(collection(db, 'notifications'));
        batch.set(notifRef, {
          uid: userDoc.id,
          title: adminNotifTitle,
          message: adminNotifMessage,
          timestamp: new Date().toISOString(),
          isRead: false,
          type: 'INFO'
        });
      });
      
      await batch.commit();

      addToast("Notification sent to all users", 'SUCCESS');
      setAdminNotifTitle('');
      setAdminNotifMessage('');
    } catch (error) {
      console.error("Failed to send notifications", error);
      addToast("Failed to send notification", 'ERROR');
    } finally {
      setIsSendingNotif(false);
    }
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !authPassword) {
      addToast("Please fill all fields", 'ERROR');
      return;
    }
    try {
      const credential = EmailAuthProvider.credential(user!.email!, oldPassword);
      await reauthenticateWithCredential(auth.currentUser!, credential);
      await updatePassword(auth.currentUser!, authPassword);
      addToast(t('password_updated'), 'SUCCESS');
      setOldPassword('');
      setAuthPassword('');
    } catch (error: any) {
      addToast(error.message, 'ERROR');
    }
  };
    let text = (translations[language] as any)[key] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, v);
      });
    }
    return text;
  };

  const handleError = (error: any, op: string, path: string | null) => {
    console.error(`Error during ${op} on ${path}:`, error);
    setAppError(error.message || "An unexpected error occurred.");
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      try {
        if (u) {
          setUser(u);
          const userDoc = await getDoc(doc(db, 'users', u.uid));
          if (userDoc.exists()) {
            const data = userDoc.data() as UserData;
            setUserData(data);
            if (data.securitySettings?.pinEnabled) {
              setIsLocked(true);
            }
            recordLoginHistory(u.uid);
          } else {
            const newData: UserData = {
              uid: u.uid,
              email: u.email || '',
              displayName: u.displayName || u.email?.split('@')[0] || 'User',
              photoURL: u.photoURL || `https://ui-avatars.com/api/?name=${u.email || 'U'}&background=random`,
              joinDate: new Date().toISOString(),
              vipLevel: 'USER',
              storageUsed: 0,
              storageLimit: STORAGE_TIERS.USER.limit,
              balance: 0,
              accountStatus: 'ACTIVE',
              securitySettings: {
                pinEnabled: false,
                biometricEnabled: false
              }
            };
            await setDoc(doc(db, 'users', u.uid), newData);
            setUserData(newData);
            recordLoginHistory(u.uid);
          }
        } else {
          setUser(null);
          setUserData(null);
        }
      } catch (error) {
        handleError(error, 'GET', 'users');
      } finally {
        setLoading(false);
      }
    });

    // Connection Test
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. The client is offline.");
        }
      }
    };
    testConnection();

    return unsubscribe;
  }, []);

  // Files & Folders Listener
  useEffect(() => {
    if (!user) return;
    
    const filesQuery = query(collection(db, 'files'), where('uid', '==', user.uid));
    const unsubscribeFiles = onSnapshot(filesQuery, (snapshot) => {
      const f = snapshot.docs.map(doc => ({ ...doc.data(), fileId: doc.id }));
      setFiles(f as any as FileData[]);
    }, (error) => handleError(error, 'LIST', 'files'));

    const foldersQuery = query(collection(db, 'folders'), where('uid', '==', user.uid));
    const unsubscribeFolders = onSnapshot(foldersQuery, (snapshot) => {
      const fo = snapshot.docs.map(doc => ({ ...doc.data(), folderId: doc.id }));
      setFolders(fo as any as FolderData[]);
    }, (error) => handleError(error, 'LIST', 'folders'));

    return () => {
      unsubscribeFiles();
      unsubscribeFolders();
    };
  }, [user]);

  // Notifications & Login History Listener
  useEffect(() => {
    if (!user) return;

    const notifQuery = query(collection(db, 'notifications'), where('uid', '==', user.uid));
    const unsubscribeNotifs = onSnapshot(notifQuery, (snapshot) => {
      const n = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as NotificationData[];
      setNotifications(n.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      
      // Trigger browser notification for new ones
      snapshot.docChanges().forEach(change => {
        if (change.type === "added" && Notification.permission === "granted") {
          const data = change.doc.data();
          new Notification(data.title, { body: data.message });
        }
      });
    });

    const historyQuery = query(collection(db, 'login_history'), where('uid', '==', user.uid));
    const unsubscribeHistory = onSnapshot(historyQuery, (snapshot) => {
      const h = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as LoginHistory[];
      setLoginHistory(h.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    });

    return () => {
      unsubscribeNotifs();
      unsubscribeHistory();
    };
  }, [user]);

  const isAdmin = useMemo(() => user && (ADMIN_UIDS.includes(user.uid) || ADMIN_EMAILS.includes(user.email || '')), [user]);

  // Admin Listeners
  useEffect(() => {
    if (!user || !isAdmin) return;

    const unsubscribeGithub = onSnapshot(doc(db, 'config', 'github'), (doc) => {
      if (doc.exists()) {
        setGithubConfig(doc.data().github);
      }
    });

    const requestsQuery = query(collection(db, 'requests'));
    const unsubscribeRequests = onSnapshot(requestsQuery, (snapshot) => {
      setRequests(snapshot.docs.map(doc => ({ ...doc.data(), requestId: doc.id })) as any as UpgradeRequest[]);
    }, (error) => handleError(error, 'LIST', 'requests'));

    const usersQuery = query(collection(db, 'users'));
    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      setAllUsers(snapshot.docs.map(doc => doc.data()) as UserData[]);
    }, (error) => handleError(error, 'LIST', 'users'));

    return () => {
      unsubscribeRequests();
      unsubscribeUsers();
    };
  }, [user, isAdmin]);

  // Handlers
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      handleError(error, 'LOGIN', 'auth');
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, authEmail, authPassword);
      if (rememberMe) {
        localStorage.setItem('remembered_email', authEmail);
      } else {
        localStorage.removeItem('remembered_email');
      }
    } catch (error) {
      handleError(error, 'LOGIN', 'auth');
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authPassword !== authConfirmPassword) {
      alert("Mật khẩu không khớp");
      return;
    }
    try {
      await createUserWithEmailAndPassword(auth, authEmail, authPassword);
    } catch (error) {
      handleError(error, 'SIGNUP', 'auth');
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await sendPasswordResetEmail(auth, authEmail);
      alert(t('password_reset_sent'));
      setShowForgotPassword(false);
    } catch (error) {
      handleError(error, 'RESET_PASSWORD', 'auth');
    }
  };

  const handleVerifyPin = () => {
    if (userData?.securitySettings?.pinHash === pinInput) {
      setIsLocked(false);
      setPinInput('');
    } else {
      alert(t('invalid_pin'));
      setPinInput('');
    }
  };

  const handleSetupPin = async () => {
    if (newPin.length !== 6 || newPin !== confirmPin) {
      alert("Mã PIN phải có 6 số và khớp nhau");
      return;
    }
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        'securitySettings.pinEnabled': true,
        'securitySettings.pinHash': newPin
      });
      alert(t('pin_saved'));
      setShowPinSetup(false);
      setNewPin('');
      setConfirmPin('');
    } catch (error) {
      handleError(error, 'SETUP_PIN', 'users');
    }
  };

  const handleToggleBiometric = async (enabled: boolean) => {
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        'securitySettings.biometricEnabled': enabled
      });
    } catch (error) {
      handleError(error, 'TOGGLE_BIOMETRIC', 'users');
    }
  };

  const handleLogout = () => signOut(auth);

  const onDrop = async (acceptedFiles: File[]) => {
    if (!user || !userData) return;

    // Bulk upload limit
    if (acceptedFiles.length > 10) {
      addToast(t('bulk_upload_limit'), 'ERROR');
      return;
    }

    // Storage warning check
    const currentUsage = userData.storageUsed || 0;
    const limit = userData.storageLimit || 0;
    const totalNewSize = acceptedFiles.reduce((acc, f) => acc + f.size, 0);

    if (currentUsage + totalNewSize > limit) {
      addToast(t('storage_warning'), 'ERROR');
      return;
    }

    // Warning if 90% full
    if ((currentUsage + totalNewSize) / limit > 0.9) {
      addToast(t('storage_warning_desc'), 'INFO');
    }

    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      const uploadPromises = acceptedFiles.map(async (file) => {
        const storageRef = ref(storage, `users/${user.uid}/${Date.now()}_${file.name}`);
        const uploadTask = uploadBytesResumable(storageRef, file);

        return new Promise<void>((resolve, reject) => {
          uploadTask.on('state_changed', 
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadProgress(progress);
            },
            (error) => {
              console.error("Upload failed", error);
              addToast("Upload failed: " + file.name, 'ERROR');
              reject(error);
            },
            async () => {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              const fileId = Math.random().toString(36).substring(7);
              
              const newFile: FileData = {
                fileId,
                uid: user.uid,
                folderId: currentFolder,
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
                downloadURL,
                uploadDate: new Date().toISOString(),
                visibility: 'PRIVATE',
                views: 0,
                downloads: 0,
                aiTags: [],
                ocrText: ""
              };

              await setDoc(doc(db, 'files', fileId), newFile);
              await updateDoc(doc(db, 'users', user.uid), {
                storageUsed: increment(file.size)
              });

              // AI Analysis in background
              if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = async () => {
                  const base64 = (reader.result as string).split(',')[1];
                  const analysis = await analyzeImage(base64, file.type);
                  if (analysis) {
                    await updateDoc(doc(db, 'files', fileId), { 
                      aiTags: analysis.tags || [], 
                      ocrText: analysis.ocrText || "" 
                    });
                  }
                };
              }
              resolve();
            }
          );
        });
      });

      await Promise.all(uploadPromises);
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      addToast(t('upload_success'), 'SUCCESS');
    } catch (error) {
      handleError(error, 'UPLOAD', 'storage');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, noClick: true } as any);

  const handleDeleteFile = async (file: FileData) => {
    if (!window.confirm(t('confirm_delete', { name: file.fileName }))) return;
    try {
      await deleteDoc(doc(db, 'files', file.fileId));
      await updateDoc(doc(db, 'users', user.uid), {
        storageUsed: increment(-file.fileSize)
      });
      setPreviewFile(null);
    } catch (error) {
      handleError(error, 'DELETE', 'files');
    }
  };

  const handleToggleStar = async (file: FileData) => {
    try {
      await updateDoc(doc(db, 'files', file.fileId), {
        isStarred: !file.isStarred
      });
    } catch (error) {
      handleError(error, 'UPDATE', 'files');
    }
  };

  const handleToggleTrash = async (file: FileData) => {
    try {
      await updateDoc(doc(db, 'files', file.fileId), {
        isDeleted: !file.isDeleted
      });
    } catch (error) {
      handleError(error, 'UPDATE', 'files');
    }
  };

  const handleRequestUpgrade = async (level: string) => {
    if (!user) return;
    const requestId = Math.random().toString(36).substring(7);
    try {
      await setDoc(doc(db, 'requests', requestId), {
        requestId,
        uid: user.uid,
        userEmail: user.email,
        userName: user.displayName,
        requestedLevel: level,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      setShowUpgradeSuccess(true);
      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    } catch (error) {
      handleError(error, 'WRITE', 'requests');
    }
  };

  const handleApproveRequest = async (request: UpgradeRequest) => {
    try {
      const tier = STORAGE_TIERS[request.requestedLevel];
      await updateDoc(doc(db, 'users', request.uid), {
        vipLevel: request.requestedLevel,
        storageLimit: tier.limit
      });
      await updateDoc(doc(db, 'requests', request.requestId), {
        status: 'APPROVED',
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      handleError(error, 'UPDATE', 'users/requests');
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    try {
      await updateDoc(doc(db, 'requests', requestId), {
        status: 'REJECTED',
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      handleError(error, 'UPDATE', 'requests');
    }
  };

  const handleDeletePermanently = async (file: FileData) => {
    if (!window.confirm(t('confirm_delete_perm', { name: file.fileName }))) return;
    try {
      await deleteDoc(doc(db, 'files', file.fileId));
      setPreviewFile(null);
    } catch (error) {
      handleError(error, 'DELETE', 'files');
    }
  };

  const handleCreateFolder = async () => {
    if (!user || !newFolderName.trim()) return;
    const folderId = Math.random().toString(36).substring(7);
    try {
      await setDoc(doc(db, 'folders', folderId), {
        folderId,
        uid: user.uid,
        name: newFolderName.trim(),
        parentId: currentFolder,
        createdAt: new Date().toISOString()
      });
      setNewFolderName('');
      setShowNewFolderModal(false);
    } catch (error) {
      handleError(error, 'WRITE', 'folders');
    }
  };

  const handleAiChat = async () => {
    if (!chatInput.trim() || !previewFile) return;
    
    const userMsg = chatInput;
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setChatInput('');
    setIsAiProcessing(true);

    try {
      // For text-based files, we'd fetch content. For now, let's simulate or use metadata.
      let content = `File Name: ${previewFile.fileName}, Type: ${previewFile.fileType}, Tags: ${previewFile.aiTags?.join(', ')}, OCR: ${previewFile.ocrText}`;
      
      const aiResponse = await chatWithFile(content, previewFile.fileName, userMsg);
      setChatMessages(prev => [...prev, { role: 'ai', text: aiResponse || "I couldn't process that." }]);
    } catch (error) {
      handleError(error, 'CHAT', 'ai');
      setChatMessages(prev => [...prev, { role: 'ai', text: "Error communicating with AI." }]);
    } finally {
      setIsAiProcessing(false);
    }
  };

  const filteredFiles = useMemo(() => {
    let f = files;
    
    // Filter by tab
    if (activeTab === 'my-files') {
      f = f.filter(file => file.folderId === currentFolder && !file.isDeleted);
    } else if (activeTab === 'photos') {
      f = f.filter(file => file.fileType.startsWith('image/') && !file.isDeleted);
    } else if (activeTab === 'starred') {
      f = f.filter(file => file.isStarred && !file.isDeleted);
    } else if (activeTab === 'recent') {
      f = f.filter(file => !file.isDeleted).sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()).slice(0, 20);
    } else if (activeTab === 'trash') {
      f = f.filter(file => file.isDeleted);
    } else if (activeTab === 'shared') {
      f = f.filter(file => file.visibility === 'PUBLIC' && !file.isDeleted);
    }

    if (searchQuery) {
      f = f.filter(file => 
        file.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        file.aiTags?.some((tag: string) => tag.toLowerCase().includes(searchQuery.toLowerCase())) ||
        file.ocrText?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return f;
  }, [files, currentFolder, searchQuery, activeTab]);

  const filteredFolders = useMemo(() => {
    if (activeTab !== 'my-files') return [];
    return folders.filter(folder => folder.parentId === currentFolder && !folder.isDeleted);
  }, [folders, currentFolder, activeTab]);

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
  </div>;

  if (user && isLocked) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white p-10 rounded-[2.5rem] shadow-2xl max-w-md w-full text-center"
      >
        <div className="w-20 h-20 bg-indigo-100 rounded-3xl flex items-center justify-center mx-auto mb-8 text-indigo-600">
          <Shield size={40} />
        </div>
        <h2 className="text-2xl font-bold mb-2">{t('enter_pin')}</h2>
        <p className="text-slate-500 mb-8">{t('smart_otp')}</p>
        
        <input 
          type="password" 
          maxLength={6}
          value={pinInput}
          onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
          className="w-full text-center text-4xl tracking-[1em] py-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-indigo-500 mb-8"
          placeholder="••••••"
        />

        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={handleVerifyPin}
            className="btn-primary py-4"
          >
            {t('confirm')}
          </button>
          <button 
            onClick={handleLogout}
            className="bg-slate-100 text-slate-600 py-4 rounded-2xl font-semibold"
          >
            {t('logout')}
          </button>
        </div>
      </motion.div>
    </div>
  );

  if (showLanding && !user) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
        <nav className="h-20 px-8 flex items-center justify-between bg-white border-b border-slate-100 sticky top-0 z-50">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <HardDrive size={24} />
            </div>
            <span className="text-xl font-black tracking-tighter text-slate-800">CLOUD 2.0</span>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setLanguage(language === 'vi' ? 'en' : 'vi')}
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 font-bold text-sm"
            >
              {language.toUpperCase()}
            </button>
            <button 
              onClick={() => setShowLanding(false)}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
            >
              {t('login')}
            </button>
          </div>
        </nav>

        <main>
          <section className="py-24 px-8 max-w-7xl mx-auto text-center">
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-6xl md:text-8xl font-black tracking-tight mb-8 leading-[0.9]"
            >
              {t('landing_title')}
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-xl text-slate-500 max-w-2xl mx-auto mb-12"
            >
              {t('landing_subtitle')}
            </motion.p>
            <motion.button 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              onClick={() => setShowLanding(false)}
              className="px-10 py-5 bg-indigo-600 text-white rounded-2xl font-black text-lg hover:scale-105 transition-all shadow-2xl shadow-indigo-200 flex items-center gap-3 mx-auto"
            >
              {t('get_started')} <ChevronRight />
            </motion.button>
          </section>

          <section className="py-24 bg-white border-y border-slate-100">
            <div className="max-w-7xl mx-auto px-8">
              <h2 className="text-3xl font-black mb-16 text-center uppercase tracking-widest text-slate-400">{t('features')}</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100">
                  <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mb-6 shadow-xl shadow-indigo-100">
                    <Cpu size={32} />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">{t('feature_ai_title')}</h3>
                  <p className="text-slate-500 leading-relaxed">{t('feature_ai_desc')}</p>
                </div>
                <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100">
                  <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center text-white mb-6 shadow-xl shadow-emerald-100">
                    <Shield size={32} />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">{t('feature_security_title')}</h3>
                  <p className="text-slate-500 leading-relaxed">{t('feature_security_desc')}</p>
                </div>
                <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100">
                  <div className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center text-white mb-6 shadow-xl shadow-amber-100">
                    <Zap size={32} />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">{t('feature_speed_title')}</h3>
                  <p className="text-slate-500 leading-relaxed">{t('feature_speed_desc')}</p>
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer className="py-12 px-8 border-t border-slate-100 text-center text-slate-400 font-bold text-sm">
          &copy; 2026 CLOUD STORAGE GOD LEVEL 2.0. ALL RIGHTS RESERVED.
        </footer>
      </div>
    );
  }

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 rounded-[2.5rem] shadow-2xl max-w-md w-full"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-indigo-200">
            <HardDrive className="text-white w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2 font-display">{t('login_title')}</h1>
          <p className="text-slate-500 text-sm">{t('login_desc')}</p>
        </div>

        {showForgotPassword ? (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <h2 className="text-xl font-bold mb-4">{t('reset_password')}</h2>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">{t('email')}</label>
              <input 
                type="email" 
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500"
                placeholder="email@example.com"
              />
            </div>
            <button type="submit" className="btn-primary w-full py-3">{t('send_reset_link')}</button>
            <button 
              type="button" 
              onClick={() => setShowForgotPassword(false)}
              className="w-full text-sm font-semibold text-slate-500 hover:text-indigo-600"
            >
              {t('back_to_login')}
            </button>
          </form>
        ) : (
          <div className="space-y-6">
            <form onSubmit={isLoginMode ? handleEmailLogin : handleEmailSignUp} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">{t('email')}</label>
                <input 
                  type="email" 
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500"
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">{t('password')}</label>
                <input 
                  type="password" 
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500"
                  placeholder="••••••••"
                />
              </div>

              {!isLoginMode && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">{t('confirm_password')}</label>
                  <input 
                    type="password" 
                    required
                    value={authConfirmPassword}
                    onChange={(e) => setAuthConfirmPassword(e.target.value)}
                    className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500"
                    placeholder="••••••••"
                  />
                </div>
              )}

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-slate-500">{t('remember_me')}</span>
                </label>
                {isLoginMode && (
                  <button 
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="text-xs font-semibold text-indigo-600 hover:underline"
                  >
                    {t('forgot_password')}
                  </button>
                )}
              </div>

              <button type="submit" className="btn-primary w-full py-3">
                {isLoginMode ? t('login_email') : t('signup_email')}
              </button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-slate-400">Or</span></div>
            </div>

            <button 
              onClick={handleLogin}
              className="w-full bg-slate-50 hover:bg-slate-100 text-slate-700 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-3 border border-slate-200"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
              {t('login_google')}
            </button>

            <p className="text-center text-sm text-slate-500">
              {isLoginMode ? t('no_account') : t('have_account')}{' '}
              <button 
                onClick={() => setIsLoginMode(!isLoginMode)}
                className="font-bold text-indigo-600 hover:underline"
              >
                {isLoginMode ? t('signup_email') : t('login_email')}
              </button>
            </p>
          </div>
        )}

        <div className="mt-8 flex items-center justify-center gap-4 text-[10px] text-slate-400">
          <div className="flex items-center gap-1"><Shield size={12} /> {t('secure')}</div>
          <div className="flex items-center gap-1"><Zap size={12} /> {t('fast')}</div>
          <div className="flex items-center gap-1"><Cpu size={12} /> {t('ai_powered')}</div>
        </div>
      </motion.div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden relative">
      {/* Mobile Overlay */}
      {isMobile && isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Mobile Header */}
      {isMobile && (
        <div className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 z-50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-100">
              <HardDrive className="text-white w-5 h-5" />
            </div>
            <span className="text-lg font-bold font-display">Cloud 2.0</span>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <Menu size={24} />
          </button>
        </div>
      )}

      {/* Error Banner */}
      <AnimatePresence>
        {appError && (
          <motion.div 
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            exit={{ y: -100 }}
            className="fixed top-0 left-0 right-0 z-[200] bg-red-600 text-white p-4 flex items-center justify-between shadow-lg"
          >
            <div className="flex items-center gap-3">
              <AlertCircle size={20} />
              <span className="font-medium">{appError}</span>
            </div>
            <button onClick={() => setAppError(null)} className="p-1 hover:bg-white/20 rounded-lg">
              <X size={20} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.aside 
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            className={`bg-white border-r border-slate-200 flex flex-col z-[60] ${isMobile ? 'fixed inset-y-0 left-0 w-72' : 'w-72 relative'}`}
          >
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100">
                  <HardDrive className="text-white w-6 h-6" />
                </div>
                <span className="text-xl font-bold font-display">Cloud 2.0</span>
              </div>
              {isMobile && (
                <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                  <X size={20} />
                </button>
              )}
            </div>

            {activeTab !== 'trash' && (
              <div className="px-4 mb-6">
                <button 
                  onClick={() => document.getElementById('file-upload')?.click()}
                  className="w-full btn-primary flex items-center justify-center gap-2 py-3"
                >
                  <Plus size={20} /> {t('new_upload')}
                </button>
                <input type="file" id="file-upload" className="hidden" multiple onChange={(e) => onDrop(Array.from(e.target.files || []))} />
              </div>
            )}

            <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
              <div className={`sidebar-item ${activeTab === 'my-files' ? 'active' : ''}`} onClick={() => {setActiveTab('my-files'); setCurrentFolder(null);}}>
                <HardDrive size={20} /> {t('my_files')}
              </div>
              <div className={`sidebar-item ${activeTab === 'photos' ? 'active' : ''}`} onClick={() => setActiveTab('photos')}>
                <ImageIcon size={20} /> {t('photos')}
              </div>
              <div className={`sidebar-item ${activeTab === 'shared' ? 'active' : ''}`} onClick={() => setActiveTab('shared')}>
                <Share2 size={20} /> {t('shared')}
              </div>
              <div className={`sidebar-item ${activeTab === 'starred' ? 'active' : ''}`} onClick={() => setActiveTab('starred')}>
                <Star size={20} /> {t('starred')}
              </div>
              <div className={`sidebar-item ${activeTab === 'recent' ? 'active' : ''}`} onClick={() => setActiveTab('recent')}>
                <Clock size={20} /> {t('recent')}
              </div>
              <div className={`sidebar-item ${activeTab === 'trash' ? 'active' : ''}`} onClick={() => setActiveTab('trash')}>
                <Trash2 size={20} /> {t('trash')}
              </div>
              
              <div className="pt-6 pb-2 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('account')}</div>
              <div className={`sidebar-item ${activeTab === 'vip' ? 'active' : ''}`} onClick={() => setActiveTab('vip')}>
                <Crown size={20} className="text-amber-500" /> {t('upgrade_vip')}
              </div>
              {isAdmin && (
                <div className={`sidebar-item ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => setActiveTab('admin')}>
                  <Shield size={20} className="text-red-500" /> {t('admin_panel')}
                </div>
              )}
              <div className={`sidebar-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
                <Settings size={20} /> {t('settings')}
              </div>

              <div className="pt-6 pb-2 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('language')}</div>
              <div className="px-4 flex gap-2">
                <button 
                  onClick={() => setLanguage('vi')}
                  className={`flex-1 py-1 text-[10px] font-bold rounded-lg border transition-all ${language === 'vi' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-500'}`}
                >
                  {t('vi_lang')}
                </button>
                <button 
                  onClick={() => setLanguage('en')}
                  className={`flex-1 py-1 text-[10px] font-bold rounded-lg border transition-all ${language === 'en' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-500'}`}
                >
                  {t('en_lang')}
                </button>
              </div>
            </nav>

            <div className="p-6 border-t border-slate-100">
              <div className="flex items-center gap-3 mb-4">
                <img src={user.photoURL} className="w-10 h-10 rounded-full border-2 border-indigo-100" alt="Avatar" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{user.displayName}</p>
                  <p className="text-xs text-slate-500 truncate">{t('plan_label', { plan: userData?.vipLevel || 'USER' })}</p>
                </div>
                <button onClick={handleLogout} className="text-slate-400 hover:text-red-500 transition-colors">
                  <LogOut size={18} />
                </button>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-slate-500">{t('storage')}</span>
                  <span className="text-slate-900">{Math.round((userData?.storageUsed || 0) / (1024 * 1024))}MB / {Math.round((userData?.storageLimit || 1) / (1024 * 1024 * 1024))}GB</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-600 rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min(100, ((userData?.storageUsed || 0) / (userData?.storageLimit || 1)) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className={`flex-1 flex flex-col min-w-0 relative transition-all ${isMobile ? 'pt-16' : ''}`}>
        {/* PWA Install Banner */}
        <AnimatePresence>
          {showInstallBanner && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-indigo-600 text-white px-8 py-3 flex items-center justify-between gap-4 overflow-hidden"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <Download size={20} />
                </div>
                <div>
                  <p className="text-sm font-bold">{t('install_app')}</p>
                  <p className="text-xs text-indigo-100">{t('install_desc')}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setShowInstallBanner(false)}
                  className="text-xs font-bold hover:underline"
                >
                  {t('maybe_later')}
                </button>
                <button 
                  onClick={async () => {
                    if (deferredPrompt) {
                      deferredPrompt.prompt();
                      const { outcome } = await deferredPrompt.userChoice;
                      if (outcome === 'accepted') {
                        setDeferredPrompt(null);
                        setShowInstallBanner(false);
                      }
                    }
                  }}
                  className="bg-white text-indigo-600 px-4 py-2 rounded-xl text-xs font-bold shadow-lg"
                >
                  {t('install_now')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between gap-6 sticky top-0 z-20">
          <div className="flex items-center gap-4 flex-1 max-w-2xl">
            {!isMobile && (
              <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
                <Menu size={20} />
              </button>
            )}
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder={t('search_placeholder')}
                className="w-full bg-slate-100 border-none rounded-2xl py-3 pl-12 pr-4 focus:ring-2 focus:ring-indigo-500 transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button 
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
              >
                <LayoutGrid size={18} />
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
              >
                <List size={18} />
              </button>
            </div>
            <button 
              onClick={() => setShowNotifications(true)}
              className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 relative"
            >
              <Bell size={20} />
              {notifications.some(n => !n.isRead) && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-indigo-600 rounded-full border-2 border-white"></span>
              )}
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8" {...getRootProps()}>
          <input {...getInputProps()} />
          
          {isUploading && (
            <div className="mb-8 bg-white p-6 rounded-3xl border border-indigo-100 shadow-lg shadow-indigo-50 animate-pulse">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                    <ArrowUp className="text-indigo-600 animate-bounce" size={20} />
                  </div>
                  <div>
                    <h3 className="font-semibold">Uploading files...</h3>
                    <p className="text-xs text-slate-500">Please don't close the window</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-indigo-600">{Math.round(uploadProgress)}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}

          {activeTab === 'vip' ? (
            <div className="max-w-4xl mx-auto py-10">
              <div className="text-center mb-12">
                <h1 className="text-4xl font-bold mb-4">{t('upgrade_title')}</h1>
                <p className="text-slate-500">{t('upgrade_desc')}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {Object.entries(STORAGE_TIERS).map(([key, tier]) => (
                  <div key={key} className={`bg-white p-8 rounded-[2.5rem] border-2 transition-all ${userData?.vipLevel === key ? 'border-indigo-600 shadow-xl' : 'border-slate-100'}`}>
                    <div className="mb-6">
                      <h3 className="text-xl font-bold mb-1">{key}</h3>
                      <p className="text-3xl font-bold">${tier.price}<span className="text-sm text-slate-400 font-normal">/mo</span></p>
                    </div>
                    <ul className="space-y-4 mb-8 text-sm text-slate-600">
                      <li className="flex items-center gap-2"><Check size={16} className="text-green-500" /> {tier.limit / (1024**3)}GB {t('storage')}</li>
                      <li className="flex items-center gap-2"><Check size={16} className="text-green-500" /> AI Analysis</li>
                      <li className="flex items-center gap-2"><Check size={16} className="text-green-500" /> Priority Support</li>
                    </ul>
                    <button 
                      onClick={() => userData?.vipLevel !== key && handleRequestUpgrade(key)}
                      className={`w-full py-3 rounded-2xl font-semibold transition-all ${userData?.vipLevel === key ? 'bg-slate-100 text-slate-400 cursor-default' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-100 active:scale-95'}`}
                    >
                      {userData?.vipLevel === key ? t('current_plan') : t('request_upgrade')}
                    </button>
                  </div>
                ))}
              </div>
              
              {requests.some(r => r.uid === user.uid && r.status === 'PENDING') && (
                <div className="mt-12 p-6 bg-amber-50 rounded-3xl border border-amber-100 flex items-center gap-4">
                  <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600">
                    <Clock size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-amber-900">{t('pending_request')}</h4>
                    <p className="text-sm text-amber-700">{t('pending_desc')}</p>
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === 'admin' ? (
            <div className="p-6 space-y-10">
              <div>
                <h1 className="text-2xl font-bold mb-6 flex items-center gap-2"><Crown className="text-amber-500" /> {t('upgrade_requests')}</h1>
                <div className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-4">{t('user')}</th>
                        <th className="px-6 py-4">{t('plan')}</th>
                        <th className="px-6 py-4">{t('date')}</th>
                        <th className="px-6 py-4">{t('actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {requests.filter(r => r.status === 'PENDING').length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-10 text-center text-slate-400 italic">{t('no_files')}</td>
                        </tr>
                      ) : (
                        requests.filter(r => r.status === 'PENDING').map(req => (
                          <tr key={req.requestId} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4">
                              <p className="font-medium">{req.userName}</p>
                              <p className="text-xs text-slate-400">{req.userEmail}</p>
                            </td>
                            <td className="px-6 py-4">
                              <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-bold">{req.requestedLevel}</span>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-500">
                              {format(new Date(req.createdAt), 'MMM d, HH:mm')}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex gap-2">
                                <button 
                                  onClick={() => handleApproveRequest(req)}
                                  className="p-2 bg-green-50 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                                  title={t('approve')}
                                >
                                  <Check size={18} />
                                </button>
                                <button 
                                  onClick={() => handleRejectRequest(req.requestId)}
                                  className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                                  title={t('reject')}
                                >
                                  <X size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h1 className="text-2xl font-bold mb-6 flex items-center gap-2"><User className="text-indigo-500" /> {t('all_users')}</h1>
                <div className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-4">{t('user')}</th>
                        <th className="px-6 py-4">{t('plan')}</th>
                        <th className="px-6 py-4">{t('storage')}</th>
                        <th className="px-6 py-4">{t('status')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allUsers.map(u => (
                        <tr key={u.uid} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 flex items-center gap-3">
                            <img src={u.photoURL} className="w-8 h-8 rounded-lg" alt="" />
                            <div>
                              <p className="font-medium">{u.displayName}</p>
                              <p className="text-xs text-slate-400">{u.email}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm font-semibold text-indigo-600">{u.vipLevel}</td>
                          <td className="px-6 py-4 text-sm">
                            <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden mb-1">
                              <div 
                                className="h-full bg-indigo-500" 
                                style={{ width: `${Math.min(100, (u.storageUsed / u.storageLimit) * 100)}%` }} 
                              />
                            </div>
                            <p className="text-[10px] text-slate-400">{Math.round(u.storageUsed / (1024**2))} MB / {u.storageLimit / (1024**3)} GB</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${u.accountStatus === 'ACTIVE' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                              {u.accountStatus === 'ACTIVE' ? t('active') : t('banned')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h1 className="text-2xl font-bold mb-6 flex items-center gap-2"><Clock className="text-indigo-500" /> {t('login_history')}</h1>
                <div className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-4">{t('user')}</th>
                        <th className="px-6 py-4">{t('device')}</th>
                        <th className="px-6 py-4">{t('ip')}</th>
                        <th className="px-6 py-4">{t('location')}</th>
                        <th className="px-6 py-4">{t('date')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allLoginHistory.map(history => {
                        const historyUser = allUsers.find(u => u.uid === history.uid);
                        return (
                          <tr key={history.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <img src={historyUser?.photoURL || `https://ui-avatars.com/api/?name=${history.uid}`} className="w-8 h-8 rounded-lg" alt="" />
                                <div>
                                  <p className="font-medium text-sm">{historyUser?.displayName || 'Unknown'}</p>
                                  <p className="text-[10px] text-slate-400">{historyUser?.email || history.uid}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-500 max-w-[200px] truncate">
                              {history.device.split(')')[0].split('(')[1] || history.device}
                            </td>
                            <td className="px-6 py-4 text-xs font-mono text-slate-500">{history.ip}</td>
                            <td className="px-6 py-4 text-xs text-indigo-600 font-bold">
                              {history.location ? `${history.location.latitude.toFixed(4)}, ${history.location.longitude.toFixed(4)}` : '-'}
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-500">
                              {new Date(history.timestamp).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : activeTab === 'settings' ? (
            <div className="max-w-4xl mx-auto py-12">
              <h2 className="text-4xl font-black mb-12 tracking-tight">{t('settings')}</h2>
              
              <div className="flex gap-4 mb-8 overflow-x-auto pb-2">
                <button 
                  onClick={() => setShowAccountSettings(false)}
                  className={`px-6 py-3 rounded-2xl font-bold transition-all whitespace-nowrap ${!showAccountSettings ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  {t('general')}
                </button>
                <button 
                  onClick={() => setShowAccountSettings(true)}
                  className={`px-6 py-3 rounded-2xl font-bold transition-all whitespace-nowrap ${showAccountSettings ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  {t('account_settings')}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-8">
                {!showAccountSettings ? (
                  <>
                    {/* General Settings */}
                    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                      <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800">
                        <Zap className="text-indigo-600" /> {t('general')}
                      </h3>
                      <div className="space-y-6">
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                          <div>
                            <p className="font-bold">{t('language')}</p>
                            <p className="text-xs text-slate-500">{language === 'vi' ? 'Tiếng Việt' : 'English'}</p>
                          </div>
                          <button 
                            onClick={() => setLanguage(language === 'vi' ? 'en' : 'vi')}
                            className="text-sm font-bold text-indigo-600"
                          >
                            {t('change')}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Admin Section */}
                    {isAdmin && (
                      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                        <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800">
                          <Crown className="text-indigo-600" /> {t('admin_panel')}
                        </h3>
                        <div className="space-y-6">
                          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                            <h4 className="font-bold mb-4 flex items-center gap-2">
                              <Bell size={18} className="text-indigo-600" /> {t('send_notification')}
                            </h4>
                            <div className="space-y-4">
                              <input 
                                type="text"
                                placeholder={t('notif_title_placeholder')}
                                className="w-full bg-white border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500"
                                value={adminNotifTitle}
                                onChange={(e) => setAdminNotifTitle(e.target.value)}
                              />
                              <textarea 
                                placeholder={t('notif_msg_placeholder')}
                                className="w-full bg-white border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500 min-h-[100px]"
                                value={adminNotifMessage}
                                onChange={(e) => setAdminNotifMessage(e.target.value)}
                              />
                              <button 
                                onClick={handleSendAdminNotification}
                                disabled={isSendingNotif}
                                className="btn-primary w-full py-3 flex items-center justify-center gap-2"
                              >
                                {isSendingNotif ? <RotateCcw className="animate-spin" size={18} /> : <Send size={18} />}
                                {t('send_to_all')}
                              </button>
                            </div>
                          </div>

                          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                            <h4 className="font-bold mb-4 flex items-center gap-2">
                              <Settings size={18} className="text-indigo-600" /> {t('github_config')}
                            </h4>
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-sm font-semibold text-slate-700 mb-2">{t('username')}</label>
                                  <input 
                                    type="text" 
                                    placeholder="username"
                                    className="w-full bg-white border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500"
                                    value={githubConfig.username}
                                    onChange={(e) => setGithubConfig({...githubConfig, username: e.target.value})}
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-semibold text-slate-700 mb-2">{t('project_name')}</label>
                                  <input 
                                    type="text" 
                                    placeholder="My Project"
                                    className="w-full bg-white border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500"
                                    value={githubConfig.projectName}
                                    onChange={(e) => setGithubConfig({...githubConfig, projectName: e.target.value})}
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">{t('token')}</label>
                                <input 
                                  type="password" 
                                  placeholder="ghp_xxxxxxxxxxxx"
                                  className="w-full bg-white border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500"
                                  value={githubConfig.token}
                                  onChange={(e) => setGithubConfig({...githubConfig, token: e.target.value})}
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-sm font-semibold text-slate-700 mb-2">{t('repositories')}</label>
                                  <input 
                                    type="text" 
                                    placeholder="repo-name"
                                    className="w-full bg-white border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500"
                                    value={githubConfig.repo}
                                    onChange={(e) => setGithubConfig({...githubConfig, repo: e.target.value})}
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-semibold text-slate-700 mb-2">{t('branch')}</label>
                                  <input 
                                    type="text" 
                                    placeholder="main"
                                    className="w-full bg-white border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500"
                                    value={githubConfig.branch}
                                    onChange={(e) => setGithubConfig({...githubConfig, branch: e.target.value})}
                                  />
                                </div>
                              </div>
                              <button 
                                onClick={handleSaveGithubConfig}
                                className="btn-primary w-full mt-4"
                              >
                                {t('save_config')}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Account Settings */}
                    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                      <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800">
                        <User className="text-indigo-600" /> {t('account_settings')}
                      </h3>
                      <div className="space-y-6">
                        <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl">
                          <img src={userData?.photoURL} alt="Avatar" className="w-16 h-16 rounded-2xl object-cover" />
                          <div>
                            <p className="font-bold text-lg">{userData?.displayName}</p>
                            <p className="text-sm text-slate-500">{userData?.email}</p>
                          </div>
                        </div>
                        
                        <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                          <h4 className="font-bold mb-4 flex items-center gap-2">
                            <Shield size={18} className="text-indigo-600" /> {t('security')}
                          </h4>
                          <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-white rounded-xl">
                              <div>
                                <p className="font-bold">{t('smart_otp')}</p>
                                <p className="text-xs text-slate-500">{t('pin_desc')}</p>
                              </div>
                              <div className="flex items-center gap-3">
                                {userData?.securitySettings?.pinEnabled && (
                                  <button 
                                    onClick={() => {
                                      updateDoc(doc(db, 'users', user!.uid), { 'securitySettings.pinEnabled': false });
                                      addToast("PIN disabled", 'INFO');
                                    }}
                                    className="text-xs font-bold text-red-500"
                                  >
                                    {t('disable')}
                                  </button>
                                )}
                                <button 
                                  onClick={() => setShowPinSetup(true)}
                                  className="text-sm font-bold text-indigo-600"
                                >
                                  {userData?.securitySettings?.pinEnabled ? t('change_pin') : t('setup_pin')}
                                </button>
                              </div>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-white rounded-xl">
                              <div>
                                <p className="font-bold">{t('biometric_auth')}</p>
                                <p className="text-xs text-slate-500">{t('biometric_desc')}</p>
                              </div>
                              <button 
                                onClick={() => handleToggleBiometric(!userData?.securitySettings?.biometricEnabled)}
                                className={`w-12 h-6 rounded-full relative transition-all ${userData?.securitySettings?.biometricEnabled ? 'bg-indigo-600' : 'bg-slate-300'}`}
                              >
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${userData?.securitySettings?.biometricEnabled ? 'right-1' : 'left-1'}`} />
                              </button>
                            </div>

                            <div className="p-4 bg-white rounded-xl space-y-4">
                              <p className="font-bold">{t('change_password')}</p>
                              <div className="space-y-3">
                                <input 
                                  type="password"
                                  placeholder={t('old_password')}
                                  className="w-full bg-slate-50 border-none rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-indigo-500"
                                  value={oldPassword}
                                  onChange={(e) => setOldPassword(e.target.value)}
                                />
                                <input 
                                  type="password"
                                  placeholder={t('new_password')}
                                  className="w-full bg-slate-50 border-none rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-indigo-500"
                                  value={authPassword}
                                  onChange={(e) => setAuthPassword(e.target.value)}
                                />
                                <button 
                                  onClick={handleChangePassword}
                                  className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold"
                                >
                                  {t('change')}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Login History */}
                    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                      <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800">
                        <Clock className="text-indigo-600" /> {t('login_history')}
                      </h3>
                      <div className="space-y-4 max-h-60 overflow-y-auto pr-2">
                        {loginHistory.length === 0 ? (
                          <p className="text-center text-slate-400 py-4 text-sm">No history found</p>
                        ) : (
                          loginHistory.map((history) => (
                            <div key={history.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400">
                                  <Monitor size={18} />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-bold truncate max-w-[150px]">{history.device.split(')')[0].split('(')[1] || t('device')}</p>
                                  <p className="text-[10px] text-slate-500">{new Date(history.timestamp).toLocaleString()}</p>
                                  {history.location && (
                                    <p className="text-[10px] text-indigo-500 font-bold flex items-center gap-1">
                                      <Zap size={10} /> {history.location.latitude.toFixed(4)}, {history.location.longitude.toFixed(4)}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="text-[10px] font-mono bg-slate-200 px-2 py-1 rounded text-slate-600">
                                {history.ip}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Breadcrumbs */}
              <div className="flex items-center gap-2 mb-8 text-sm text-slate-500">
                <button onClick={() => setCurrentFolder(null)} className="hover:text-indigo-600 transition-colors">
                  {activeTab === 'my-files' ? t('my_files') : t(activeTab)}
                </button>
                {currentFolder && (
                  <>
                    <ChevronRight size={14} />
                    <span className="text-slate-900 font-medium">{folders.find(f => f.folderId === currentFolder)?.folderName}</span>
                  </>
                )}
              </div>

              {/* Folders Section */}
              {filteredFolders.length > 0 && (
                <div className="mb-10">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      <Folder className="text-amber-500" size={20} /> {t('folders')}
                    </h2>
                    <button onClick={() => setShowNewFolderModal(true)} className="text-sm text-indigo-600 font-medium hover:underline">{t('new_folder')}</button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {filteredFolders.map(folder => (
                      <div 
                        key={folder.id}
                        onClick={() => setCurrentFolder(folder.folderId)}
                        className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer flex items-center gap-3 group"
                      >
                        <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform">
                          <Folder size={24} fill="currentColor" fillOpacity={0.2} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{folder.folderName}</p>
                          <p className="text-xs text-slate-400">Folder</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Files Section */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <File className="text-indigo-500" size={20} /> {t('files')}
                  </h2>
                  <div className="flex items-center gap-4 text-sm text-slate-500">
                    <span className="flex items-center gap-1"><Filter size={14} /> Sort by Date</span>
                  </div>
                </div>

                {filteredFiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[2.5rem] border-2 border-dashed border-slate-200">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                      <HardDrive className="text-slate-300" size={40} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-2">{t('no_files')}</h3>
                    <p className="text-slate-500 mb-8">{t('drag_drop')}</p>
                    <button onClick={() => document.getElementById('file-upload')?.click()} className="btn-secondary">{t('browse_files')}</button>
                  </div>
                ) : (
                  <div className={viewMode === 'grid' ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6" : "space-y-3"}>
                    {filteredFiles.map(file => (
                      <motion.div 
                        layout
                        key={file.id}
                        onClick={() => setPreviewFile(file)}
                        className={viewMode === 'grid' ? "file-card" : "bg-white p-4 rounded-2xl border border-slate-100 flex items-center gap-4 hover:shadow-md transition-all cursor-pointer"}
                      >
                        {viewMode === 'grid' ? (
                          <>
                            <div className="aspect-square rounded-xl bg-slate-50 mb-4 flex items-center justify-center overflow-hidden relative group-hover:bg-slate-100 transition-colors">
                              {file.fileType.startsWith('image/') ? (
                                <img src={file.downloadURL} className="w-full h-full object-cover" alt={file.fileName} referrerPolicy="no-referrer" />
                              ) : file.fileType.startsWith('video/') ? (
                                <Video className="text-indigo-400" size={40} />
                              ) : file.fileType.startsWith('audio/') ? (
                                <Music className="text-purple-400" size={40} />
                              ) : (
                                <FileText className="text-slate-400" size={40} />
                              )}
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-all" />
                              {file.isStarred && (
                                <div className="absolute top-2 right-2 text-amber-500 drop-shadow-sm">
                                  <Star size={16} fill="currentColor" />
                                </div>
                              )}
                            </div>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold truncate text-slate-900">{file.fileName}</p>
                                <p className="text-xs text-slate-400">{Math.round(file.fileSize / 1024)} KB • {format(new Date(file.uploadDate), 'MMM d, yyyy')}</p>
                              </div>
                              <button className="p-1 hover:bg-slate-100 rounded-lg text-slate-400">
                                <MoreVertical size={16} />
                              </button>
                            </div>
                            {file.aiTags && file.aiTags.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-1">
                                {file.aiTags.slice(0, 2).map((tag: string) => (
                                  <span key={tag} className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">#{tag}</span>
                                ))}
                                {file.aiTags.length > 2 && <span className="text-[10px] text-slate-400">+{file.aiTags.length - 2}</span>}
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center shrink-0">
                              {file.fileType.startsWith('image/') ? <ImageIcon className="text-indigo-400" size={24} /> : <FileText className="text-slate-400" size={24} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold truncate">{file.fileName}</p>
                              <p className="text-xs text-slate-400">{file.fileType} • {Math.round(file.fileSize / 1024)} KB</p>
                            </div>
                            <div className="text-xs text-slate-400 hidden md:block">{format(new Date(file.uploadDate), 'MMM d, yyyy HH:mm')}</div>
                            <div className="flex items-center gap-2">
                              {file.isStarred && <Star size={18} className="text-amber-500" fill="currentColor" />}
                              <button className="p-2 hover:bg-slate-100 rounded-xl text-slate-400"><Download size={18} /></button>
                              <button className="p-2 hover:bg-slate-100 rounded-xl text-slate-400"><MoreVertical size={18} /></button>
                            </div>
                          </>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Drag Overlay */}
        {isDragActive && (
          <div className="absolute inset-0 bg-indigo-600/10 backdrop-blur-sm border-4 border-dashed border-indigo-600 z-50 flex items-center justify-center">
            <div className="bg-white p-10 rounded-[3rem] shadow-2xl text-center">
              <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-indigo-200">
                <ArrowUp className="text-white animate-bounce" size={40} />
              </div>
              <h2 className="text-3xl font-bold text-slate-900 mb-2">{t('drop_to_upload')}</h2>
              <p className="text-slate-500">{t('release_to_start')}</p>
            </div>
          </div>
        )}
      </main>

      {/* File Preview Modal */}
      <AnimatePresence>
        {previewFile && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4 md:p-10"
          >
            <div className="bg-white w-full max-w-6xl h-full rounded-[2.5rem] overflow-hidden flex flex-col md:flex-row shadow-2xl">
              {/* Preview Area */}
              <div className="flex-1 bg-slate-100 flex flex-col relative">
                <div className="absolute top-6 left-6 z-10 flex items-center gap-3">
                  <button onClick={() => setPreviewFile(null)} className="p-3 bg-white/80 backdrop-blur hover:bg-white rounded-2xl shadow-sm transition-all">
                    <X size={20} />
                  </button>
                  <div className="bg-white/80 backdrop-blur px-4 py-2.5 rounded-2xl shadow-sm font-semibold truncate max-w-xs">
                    {previewFile.fileName}
                  </div>
                </div>

                <div className="flex-1 flex items-center justify-center p-10">
                  {previewFile.fileType.startsWith('image/') ? (
                    <img src={previewFile.downloadURL} className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" alt="Preview" referrerPolicy="no-referrer" />
                  ) : previewFile.fileType.startsWith('video/') ? (
                    <video src={previewFile.downloadURL} controls className="max-w-full max-h-full rounded-xl shadow-2xl" />
                  ) : previewFile.fileType.startsWith('audio/') ? (
                    <div className="bg-white p-10 rounded-3xl shadow-xl flex flex-col items-center gap-6">
                      <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600">
                        <Music size={48} />
                      </div>
                      <audio src={previewFile.downloadURL} controls className="w-80" />
                    </div>
                  ) : (
                    <div className="bg-white p-20 rounded-[3rem] shadow-xl flex flex-col items-center gap-6 text-center">
                      <div className="w-24 h-24 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-400">
                        <FileText size={48} />
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold mb-2">{t('no_preview')}</h3>
                        <p className="text-slate-500">{t('no_preview_desc')}</p>
                      </div>
                      <a href={previewFile.downloadURL} target="_blank" rel="noreferrer" className="btn-primary flex items-center gap-2">
                        <Download size={20} /> {t('download_file')}
                      </a>
                    </div>
                  )}
                </div>

                <div className="p-6 bg-white/50 backdrop-blur flex items-center justify-center gap-4">
                  <button className="p-3 bg-white hover:bg-slate-50 rounded-2xl shadow-sm text-slate-600 transition-all"><Share2 size={20} /></button>
                  <button 
                    onClick={() => handleToggleStar(previewFile)}
                    className={`p-3 bg-white hover:bg-slate-50 rounded-2xl shadow-sm transition-all ${previewFile.isStarred ? 'text-amber-500' : 'text-slate-600'}`}
                  >
                    <Star size={20} fill={previewFile.isStarred ? "currentColor" : "none"} />
                  </button>
                  <a href={previewFile.downloadURL} download className="p-3 bg-white hover:bg-slate-50 rounded-2xl shadow-sm text-slate-600 transition-all"><Download size={20} /></a>
                  {previewFile.isDeleted ? (
                    <>
                      <button onClick={() => handleToggleTrash(previewFile)} className="p-3 bg-white hover:bg-green-50 rounded-2xl shadow-sm text-green-600 transition-all">
                        <RotateCcw size={20} />
                      </button>
                      <button onClick={() => handleDeletePermanently(previewFile)} className="p-3 bg-white hover:bg-red-50 rounded-2xl shadow-sm text-red-500 transition-all">
                        <Trash2 size={20} />
                      </button>
                    </>
                  ) : (
                    <button onClick={() => handleToggleTrash(previewFile)} className="p-3 bg-white hover:bg-red-50 rounded-2xl shadow-sm text-red-500 transition-all">
                      <Trash2 size={20} />
                    </button>
                  )}
                </div>
              </div>

              {/* Info & AI Sidebar */}
              <div className="w-full md:w-96 border-l border-slate-100 flex flex-col bg-white">
                <div className="p-6 border-b border-slate-100">
                  <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
                    <button 
                      onClick={() => setAiChatOpen(false)}
                      className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${!aiChatOpen ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
                    >
                      {t('details')}
                    </button>
                    <button 
                      onClick={() => {
                        if (isFeatureUnlocked('AI_CHAT')) {
                          setAiChatOpen(true);
                        } else {
                          alert(t('upgrade_to_unlock', { plan: 'SVIP' }));
                        }
                      }}
                      className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${aiChatOpen ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
                    >
                      {t('ai_chat')}
                    </button>
                  </div>

                  {!aiChatOpen ? (
                    <div className="space-y-6">
                      <div>
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{t('information')}</h4>
                        <div className="space-y-3">
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-500">{t('type')}</span>
                            <span className="font-medium">{previewFile.fileType}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-500">{t('size')}</span>
                            <span className="font-medium">{Math.round(previewFile.fileSize / 1024)} KB</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-500">{t('uploaded')}</span>
                            <span className="font-medium">{format(new Date(previewFile.uploadDate), 'MMM d, yyyy')}</span>
                          </div>
                        </div>
                      </div>

                      {previewFile.aiTags && previewFile.aiTags.length > 0 && (
                        <div>
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{t('ai_tags')}</h4>
                          <div className="flex flex-wrap gap-2">
                            {previewFile.aiTags.map((tag: string) => (
                              <span key={tag} className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-xs font-semibold">#{tag}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {previewFile.ocrText && (
                        <div>
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{t('ocr_text')}</h4>
                          <div className="bg-slate-50 p-4 rounded-2xl text-sm text-slate-600 italic max-h-40 overflow-y-auto">
                            "{previewFile.ocrText}"
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col h-[calc(100vh-250px)]">
                      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
                        {chatMessages.length === 0 && (
                          <div className="text-center py-10">
                            <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-indigo-600">
                              <Cpu size={32} />
                            </div>
                            <p className="text-sm text-slate-500">{t('ask_ai_desc')}</p>
                          </div>
                        )}
                        {chatMessages.map((msg, i) => (
                          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                              {msg.text}
                            </div>
                          </div>
                        ))}
                        {isAiProcessing && (
                          <div className="flex justify-start">
                            <div className="bg-slate-100 p-3 rounded-2xl flex gap-1">
                              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="relative">
                        <input 
                          type="text" 
                          placeholder={t('ask_ai')} 
                          className="w-full bg-slate-100 border-none rounded-2xl py-3 pl-4 pr-12 text-sm focus:ring-2 focus:ring-indigo-500"
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAiChat()}
                        />
                        <button 
                          onClick={handleAiChat}
                          disabled={isAiProcessing || !chatInput.trim()}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 text-white rounded-xl disabled:opacity-50"
                        >
                          <Send size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upgrade Success Modal */}
      <AnimatePresence>
        {showUpgradeSuccess && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              className="bg-white p-10 rounded-[3rem] shadow-2xl max-w-md w-full text-center relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
              <div className="w-20 h-20 bg-green-50 rounded-3xl flex items-center justify-center mx-auto mb-8 text-green-500">
                <CheckCircle2 size={40} />
              </div>
              <h2 className="text-3xl font-bold text-slate-900 mb-4">{t('request_sent')}</h2>
              <p className="text-slate-500 mb-8">{t('request_sent_desc')}</p>
              
              <div className="bg-slate-50 p-6 rounded-3xl mb-8 border border-slate-100">
                <p className="text-sm font-semibold text-slate-700 mb-4">{t('contact_admin')}:</p>
                <a 
                  href="https://facebook.com/admin_profile" 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex items-center justify-center gap-3 bg-indigo-600 text-white py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                >
                  <User size={20} /> {t('contact_admin')}
                </a>
              </div>

              <button 
                onClick={() => setShowUpgradeSuccess(false)}
                className="w-full py-3 text-slate-400 font-semibold hover:text-slate-600 transition-colors"
              >
                {t('close')}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showNewFolderModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[150] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white p-8 rounded-[2rem] shadow-2xl max-w-sm w-full"
            >
              <h3 className="text-xl font-bold mb-4">{t('new_folder')}</h3>
              <input 
                type="text" 
                placeholder={t('folder_name')} 
                className="w-full bg-slate-100 border-none rounded-xl py-3 px-4 mb-6 focus:ring-2 focus:ring-indigo-500"
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              />
              <div className="flex gap-3">
                <button onClick={() => setShowNewFolderModal(false)} className="flex-1 btn-secondary">{t('cancel')}</button>
                <button onClick={handleCreateFolder} className="flex-1 btn-primary">{t('create')}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Toast System */}
      <div className="fixed bottom-8 right-8 z-[200] space-y-3 pointer-events-none">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div 
              key={toast.id}
              initial={{ opacity: 0, x: 20, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.9 }}
              className={`px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 pointer-events-auto min-w-[300px] ${
                toast.type === 'SUCCESS' ? 'bg-emerald-600 text-white' :
                toast.type === 'ERROR' ? 'bg-red-600 text-white' :
                'bg-slate-800 text-white'
              }`}
            >
              {toast.type === 'SUCCESS' ? <CheckCircle2 size={20} /> :
               toast.type === 'ERROR' ? <AlertCircle size={20} /> :
               <Info size={20} />}
              <p className="text-sm font-bold">{toast.message}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showNotifications && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNotifications(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl flex flex-col max-h-[80vh]"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">{t('notifications_title')}</h2>
                <button 
                  onClick={async () => {
                    const batch = notifications.filter(n => !n.isRead);
                    for (const n of batch) {
                      await updateDoc(doc(db, 'notifications', n.id), { isRead: true });
                    }
                  }}
                  className="text-xs font-bold text-indigo-600 hover:underline"
                >
                  {t('mark_all_read')}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {notifications.length === 0 ? (
                  <div className="text-center py-10">
                    <Bell className="mx-auto text-slate-200 mb-4" size={48} />
                    <p className="text-slate-400">{t('no_notifications')}</p>
                  </div>
                ) : (
                  notifications.map(notif => (
                    <div 
                      key={notif.id} 
                      className={`p-4 rounded-2xl border transition-all ${notif.isRead ? 'bg-white border-slate-100' : 'bg-indigo-50 border-indigo-100 shadow-sm'}`}
                      onClick={() => updateDoc(doc(db, 'notifications', notif.id), { isRead: true })}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          notif.type === 'SUCCESS' ? 'bg-emerald-100 text-emerald-600' :
                          notif.type === 'WARNING' ? 'bg-amber-100 text-amber-600' :
                          notif.type === 'ERROR' ? 'bg-red-100 text-red-600' :
                          'bg-indigo-100 text-indigo-600'
                        }`}>
                          <Info size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900">{notif.title}</p>
                          <p className="text-xs text-slate-600 mt-1">{notif.message}</p>
                          <p className="text-[10px] text-slate-400 mt-2">{new Date(notif.timestamp).toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <button 
                onClick={() => setShowNotifications(false)}
                className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold mt-6"
              >
                {t('close')}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPinSetup && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPinSetup(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl"
            >
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-indigo-600">
                  <Shield size={32} />
                </div>
                <h2 className="text-2xl font-bold">{t('setup_pin')}</h2>
                <p className="text-slate-500 text-sm">{t('pin_setup_desc')}</p>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">{t('new_pin')}</label>
                  <input 
                    type="password" 
                    maxLength={6}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full text-center text-2xl tracking-[0.5em] py-3 bg-slate-50 rounded-xl border-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="••••••"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">{t('confirm_pin')}</label>
                  <input 
                    type="password" 
                    maxLength={6}
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full text-center text-2xl tracking-[0.5em] py-3 bg-slate-50 rounded-xl border-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="••••••"
                  />
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => setShowPinSetup(false)}
                    className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold"
                  >
                    {t('cancel')}
                  </button>
                  <button 
                    onClick={handleSetupPin}
                    className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-100"
                  >
                    {t('save')}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
