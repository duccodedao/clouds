/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  auth, db, storage, googleProvider, 
  signInWithPopup, signOut, onAuthStateChanged,
  doc, getDoc, setDoc, updateDoc, collection, query, where, onSnapshot, addDoc, deleteDoc, serverTimestamp, increment,
  ref, uploadBytesResumable, getDownloadURL, deleteObject
} from './firebase';
import { 
  Search, HardDrive, Image as ImageIcon, Share2, Trash2, Star, Settings, 
  Plus, Folder, File, FileText, Video, Music, MoreVertical, Download, 
  Eye, X, Send, Cpu, Shield, Zap, Crown, LogOut, Menu, ChevronRight,
  LayoutGrid, List, Filter, ArrowUp, Clock, User, CheckCircle2, AlertCircle,
  RotateCcw, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { useDropzone } from 'react-dropzone';
import confetti from 'canvas-confetti';
import { analyzeImage, chatWithFile, semanticSearch } from './services/aiService';
import { getDocFromServer } from 'firebase/firestore';
import { UserData, FileData, FolderData, UpgradeRequest } from './types';
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
  const [githubConfig, setGithubConfig] = useState({ token: '', repo: '', branch: 'main' });
  const [showUpgradeSuccess, setShowUpgradeSuccess] = useState(false);
  const [language, setLanguage] = useState<'vi' | 'en'>('vi');

  const t = (key: string, params?: Record<string, string>) => {
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
            setUserData(userDoc.data());
          } else {
            const newData = {
              uid: u.uid,
              email: u.email,
              displayName: u.displayName,
              photoURL: u.photoURL,
              joinDate: new Date().toISOString(),
              vipLevel: 'USER',
              storageUsed: 0,
              storageLimit: STORAGE_TIERS.USER.limit,
              balance: 0,
              accountStatus: 'ACTIVE'
            };
            await setDoc(doc(db, 'users', u.uid), newData);
            setUserData(newData);
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

  const isAdmin = useMemo(() => user && (ADMIN_UIDS.includes(user.uid) || ADMIN_EMAILS.includes(user.email || '')), [user]);

  // Admin Listeners
  useEffect(() => {
    if (!user || !isAdmin) return;

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

  const handleLogout = () => signOut(auth);

  const onDrop = async (acceptedFiles: File[]) => {
    if (!user || !userData) return;
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

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-10 rounded-[2.5rem] shadow-2xl max-w-md w-full text-center"
      >
        <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-indigo-200">
          <HardDrive className="text-white w-10 h-10" />
        </div>
        <h1 className="text-4xl font-bold text-slate-900 mb-4 font-display">{t('login_title')}</h1>
        <p className="text-slate-500 mb-10 text-lg">{t('login_desc')}</p>
        <button 
          onClick={handleLogin}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-semibold text-lg transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-3 active:scale-95"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" />
          {t('login_google')}
        </button>
        <div className="mt-8 flex items-center justify-center gap-6 text-slate-400">
          <div className="flex items-center gap-1"><Shield size={16} /> {t('secure')}</div>
          <div className="flex items-center gap-1"><Zap size={16} /> {t('fast')}</div>
          <div className="flex items-center gap-1"><Cpu size={16} /> {t('ai_powered')}</div>
        </div>
      </motion.div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
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
            className="w-72 bg-white border-r border-slate-200 flex flex-col z-30"
          >
            <div className="p-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100">
                <HardDrive className="text-white w-6 h-6" />
              </div>
              <span className="text-xl font-bold font-display">Cloud 2.0</span>
            </div>

            <div className="px-4 mb-6">
              <button 
                onClick={() => document.getElementById('file-upload')?.click()}
                className="w-full btn-primary flex items-center justify-center gap-2 py-3"
              >
                <Plus size={20} /> {t('new_upload')}
              </button>
              <input type="file" id="file-upload" className="hidden" multiple onChange={(e) => onDrop(Array.from(e.target.files || []))} />
            </div>

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
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Header */}
        <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between gap-6 sticky top-0 z-20">
          <div className="flex items-center gap-4 flex-1 max-w-2xl">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
              <Menu size={20} />
            </button>
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
            <button className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 relative">
              <Clock size={20} />
              <span className="absolute top-1 right-1 w-2 h-2 bg-indigo-600 rounded-full border-2 border-white"></span>
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
            </div>
          ) : activeTab === 'settings' ? (
            <div className="max-w-2xl mx-auto py-10">
              <h1 className="text-3xl font-bold mb-8">{t('settings')}</h1>
              
              <div className="space-y-8">
                {isAdmin && (
                  <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800">
                      <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white">
                        <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
                      </div>
                      {t('github_config')}
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">{t('token')}</label>
                        <input 
                          type="password" 
                          placeholder="ghp_xxxxxxxxxxxx"
                          className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500"
                          value={githubConfig.token}
                          onChange={(e) => setGithubConfig({...githubConfig, token: e.target.value})}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-2">{t('repo')}</label>
                          <input 
                            type="text" 
                            placeholder="username/repo"
                            className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500"
                            value={githubConfig.repo}
                            onChange={(e) => setGithubConfig({...githubConfig, repo: e.target.value})}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-2">{t('branch')}</label>
                          <input 
                            type="text" 
                            placeholder="main"
                            className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500"
                            value={githubConfig.branch}
                            onChange={(e) => setGithubConfig({...githubConfig, branch: e.target.value})}
                          />
                        </div>
                      </div>
                      <button className="btn-primary w-full mt-4">{t('save_config')}</button>
                    </div>
                  </div>
                )}

                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                  <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800">
                    <User className="text-indigo-600" /> {t('account_settings')}
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                      <div>
                        <p className="font-bold">{t('notifications')}</p>
                        <p className="text-xs text-slate-500">Receive alerts about your storage</p>
                      </div>
                      <div className="w-12 h-6 bg-indigo-600 rounded-full relative cursor-pointer">
                        <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                      <div>
                        <p className="font-bold">{t('two_factor')}</p>
                        <p className="text-xs text-slate-500">Enhance your account security</p>
                      </div>
                      <button className="text-sm font-bold text-indigo-600">{t('enable')}</button>
                    </div>
                  </div>
                </div>
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
                      onClick={() => setAiChatOpen(true)}
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
    </div>
  );
}
