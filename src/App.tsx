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
  LayoutGrid, List, Filter, ArrowUp, Clock, User, CheckCircle2, AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { useDropzone } from 'react-dropzone';
import confetti from 'canvas-confetti';
import { analyzeImage, chatWithFile, semanticSearch } from './services/aiService';
import { getDocFromServer } from 'firebase/firestore';
import { UserData, FileData, FolderData } from './types';

// --- Constants & Types ---

const STORAGE_TIERS = {
  USER: { limit: 1024 * 1024 * 1024, label: 'Standard', color: 'bg-slate-500' },
  VIP: { limit: 10 * 1024 * 1024 * 1024, label: 'VIP', color: 'bg-indigo-500' },
  SVIP: { limit: 50 * 1024 * 1024 * 1024, label: 'SVIP', color: 'bg-purple-500' },
  VVIP: { limit: 200 * 1024 * 1024 * 1024, label: 'VVIP', color: 'bg-amber-500' },
  ENTERPRISE: { limit: 1000 * 1024 * 1024 * 1024, label: 'Enterprise', color: 'bg-emerald-500' },
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
  operationType: OperationType;
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

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false, error: null };

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-6 text-red-500">
              <AlertCircle size={32} />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Something went wrong</h2>
            <p className="text-slate-500 mb-6 text-sm overflow-hidden text-ellipsis">
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <button onClick={() => window.location.reload()} className="btn-primary w-full">Reload Application</button>
          </div>
        </div>
      );
    }
    return (this as any).props.children;
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
        console.error("Auth initialization error:", error);
        handleFirestoreError(error, OperationType.GET, 'users');
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
      const f = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFiles(f);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'files'));

    const foldersQuery = query(collection(db, 'folders'), where('uid', '==', user.uid));
    const unsubscribeFolders = onSnapshot(foldersQuery, (snapshot) => {
      const fo = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFolders(fo);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'folders'));

    return () => {
      unsubscribeFiles();
      unsubscribeFolders();
    };
  }, [user]);

  // Handlers
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = () => signOut(auth);

  const onDrop = async (acceptedFiles: File[]) => {
    if (!user || !userData) return;
    setIsUploading(true);
    
    for (const file of acceptedFiles) {
      const storageRef = ref(storage, `users/${user.uid}/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => {
          console.error("Upload failed", error);
          setIsUploading(false);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          
          // AI Analysis for images
          let aiTags: string[] = [];
          let ocrText = "";
          if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
              const base64 = (reader.result as string).split(',')[1];
              const analysis = await analyzeImage(base64, file.type);
              if (analysis) {
                aiTags = analysis.tags || [];
                ocrText = analysis.ocrText || "";
                
                // Update file doc with AI data
                await updateDoc(doc(db, 'files', fileId), { aiTags, ocrText });
              }
            };
          }

          const fileId = Math.random().toString(36).substring(7);
          try {
            await setDoc(doc(db, 'files', fileId), {
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
            });

            // Update storage used
            await updateDoc(doc(db, 'users', user.uid), {
              storageUsed: increment(file.size)
            });
          } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, 'files');
          }

          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
          });
        }
      );
    }
    setIsUploading(false);
    setUploadProgress(0);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop } as any);

  const handleCreateFolder = async () => {
    const name = prompt("Enter folder name:");
    if (!name || !user) return;
    
    const folderId = Math.random().toString(36).substring(7);
    try {
      await setDoc(doc(db, 'folders', folderId), {
        folderId,
        uid: user.uid,
        parentId: currentFolder,
        folderName: name,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'folders');
    }
  };

  const handleDeleteFile = async (file: any) => {
    if (!confirm(`Delete ${file.fileName}?`)) return;
    try {
      await deleteDoc(doc(db, 'files', file.id));
      // Optionally delete from storage too
      // const fileRef = ref(storage, file.downloadURL);
      // await deleteObject(fileRef);
      await updateDoc(doc(db, 'users', user.uid), {
        storageUsed: increment(-file.fileSize)
      });
    } catch (error) {
      console.error("Delete failed", error);
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
      setChatMessages(prev => [...prev, { role: 'ai', text: "Error communicating with AI." }]);
    } finally {
      setIsAiProcessing(false);
    }
  };

  const filteredFiles = useMemo(() => {
    let f = files.filter(file => file.folderId === currentFolder);
    if (searchQuery) {
      f = f.filter(file => 
        file.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        file.aiTags?.some((tag: string) => tag.toLowerCase().includes(searchQuery.toLowerCase())) ||
        file.ocrText?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return f;
  }, [files, currentFolder, searchQuery]);

  const filteredFolders = useMemo(() => {
    return folders.filter(folder => folder.parentId === currentFolder);
  }, [folders, currentFolder]);

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
        <h1 className="text-4xl font-bold text-slate-900 mb-4 font-display">Cloud Storage 2.0</h1>
        <p className="text-slate-500 mb-10 text-lg">Secure, AI-powered storage for your digital life. Experience the next generation of file management.</p>
        <button 
          onClick={handleLogin}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-semibold text-lg transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-3 active:scale-95"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" />
          Continue with Google
        </button>
        <div className="mt-8 flex items-center justify-center gap-6 text-slate-400">
          <div className="flex items-center gap-1"><Shield size={16} /> Secure</div>
          <div className="flex items-center gap-1"><Zap size={16} /> Fast</div>
          <div className="flex items-center gap-1"><Cpu size={16} /> AI-Powered</div>
        </div>
      </motion.div>
    </div>
  );

  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-slate-50 overflow-hidden">
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
                <Plus size={20} /> New Upload
              </button>
              <input type="file" id="file-upload" className="hidden" multiple onChange={(e) => onDrop(Array.from(e.target.files || []))} />
            </div>

            <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
              <div className={`sidebar-item ${activeTab === 'my-files' ? 'active' : ''}`} onClick={() => {setActiveTab('my-files'); setCurrentFolder(null);}}>
                <HardDrive size={20} /> My Files
              </div>
              <div className={`sidebar-item ${activeTab === 'photos' ? 'active' : ''}`} onClick={() => setActiveTab('photos')}>
                <ImageIcon size={20} /> Photos
              </div>
              <div className={`sidebar-item ${activeTab === 'shared' ? 'active' : ''}`} onClick={() => setActiveTab('shared')}>
                <Share2 size={20} /> Shared
              </div>
              <div className={`sidebar-item ${activeTab === 'starred' ? 'active' : ''}`} onClick={() => setActiveTab('starred')}>
                <Star size={20} /> Starred
              </div>
              <div className={`sidebar-item ${activeTab === 'trash' ? 'active' : ''}`} onClick={() => setActiveTab('trash')}>
                <Trash2 size={20} /> Trash
              </div>
              
              <div className="pt-6 pb-2 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Account</div>
              <div className={`sidebar-item ${activeTab === 'vip' ? 'active' : ''}`} onClick={() => setActiveTab('vip')}>
                <Crown size={20} className="text-amber-500" /> Upgrade VIP
              </div>
              {ADMIN_UIDS.includes(user.uid) && (
                <div className={`sidebar-item ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => setActiveTab('admin')}>
                  <Shield size={20} className="text-red-500" /> Admin Panel
                </div>
              )}
              <div className="sidebar-item" onClick={() => setActiveTab('settings')}>
                <Settings size={20} /> Settings
              </div>
            </nav>

            <div className="p-6 border-t border-slate-100">
              <div className="flex items-center gap-3 mb-4">
                <img src={user.photoURL} className="w-10 h-10 rounded-full border-2 border-indigo-100" alt="Avatar" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{user.displayName}</p>
                  <p className="text-xs text-slate-500 truncate">{userData?.vipLevel} Plan</p>
                </div>
                <button onClick={handleLogout} className="text-slate-400 hover:text-red-500 transition-colors">
                  <LogOut size={18} />
                </button>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-slate-500">Storage</span>
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
                placeholder="Search files, tags, or content..." 
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

          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 mb-8 text-sm text-slate-500">
            <button onClick={() => setCurrentFolder(null)} className="hover:text-indigo-600 transition-colors">My Files</button>
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
                  <Folder className="text-amber-500" size={20} /> Folders
                </h2>
                <button onClick={handleCreateFolder} className="text-sm text-indigo-600 font-medium hover:underline">New Folder</button>
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
                <File className="text-indigo-500" size={20} /> Files
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
                <h3 className="text-xl font-bold text-slate-900 mb-2">No files found</h3>
                <p className="text-slate-500 mb-8">Drag and drop files here to upload</p>
                <button onClick={() => document.getElementById('file-upload')?.click()} className="btn-secondary">Browse Files</button>
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
        </div>

        {/* Drag Overlay */}
        {isDragActive && (
          <div className="absolute inset-0 bg-indigo-600/10 backdrop-blur-sm border-4 border-dashed border-indigo-600 z-50 flex items-center justify-center">
            <div className="bg-white p-10 rounded-[3rem] shadow-2xl text-center">
              <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-indigo-200">
                <ArrowUp className="text-white animate-bounce" size={40} />
              </div>
              <h2 className="text-3xl font-bold text-slate-900 mb-2">Drop to upload</h2>
              <p className="text-slate-500">Release your files to start uploading to Cloud 2.0</p>
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
                        <h3 className="text-2xl font-bold mb-2">No Preview Available</h3>
                        <p className="text-slate-500">This file type cannot be previewed directly.</p>
                      </div>
                      <a href={previewFile.downloadURL} target="_blank" rel="noreferrer" className="btn-primary flex items-center gap-2">
                        <Download size={20} /> Download File
                      </a>
                    </div>
                  )}
                </div>

                <div className="p-6 bg-white/50 backdrop-blur flex items-center justify-center gap-4">
                  <button className="p-3 bg-white hover:bg-slate-50 rounded-2xl shadow-sm text-slate-600 transition-all"><Share2 size={20} /></button>
                  <button className="p-3 bg-white hover:bg-slate-50 rounded-2xl shadow-sm text-slate-600 transition-all"><Star size={20} /></button>
                  <a href={previewFile.downloadURL} download className="p-3 bg-white hover:bg-slate-50 rounded-2xl shadow-sm text-slate-600 transition-all"><Download size={20} /></a>
                  <button onClick={() => handleDeleteFile(previewFile)} className="p-3 bg-white hover:bg-red-50 rounded-2xl shadow-sm text-red-500 transition-all"><Trash2 size={20} /></button>
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
                      Details
                    </button>
                    <button 
                      onClick={() => setAiChatOpen(true)}
                      className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${aiChatOpen ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
                    >
                      AI Chat
                    </button>
                  </div>

                  {!aiChatOpen ? (
                    <div className="space-y-6">
                      <div>
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Information</h4>
                        <div className="space-y-3">
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Type</span>
                            <span className="font-medium">{previewFile.fileType}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Size</span>
                            <span className="font-medium">{Math.round(previewFile.fileSize / 1024)} KB</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Uploaded</span>
                            <span className="font-medium">{format(new Date(previewFile.uploadDate), 'MMM d, yyyy')}</span>
                          </div>
                        </div>
                      </div>

                      {previewFile.aiTags && previewFile.aiTags.length > 0 && (
                        <div>
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">AI Tags</h4>
                          <div className="flex flex-wrap gap-2">
                            {previewFile.aiTags.map((tag: string) => (
                              <span key={tag} className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-xs font-semibold">#{tag}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {previewFile.ocrText && (
                        <div>
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">OCR Text</h4>
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
                            <p className="text-sm text-slate-500">Ask AI anything about this file. I can summarize, analyze, and answer questions.</p>
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
                          placeholder="Ask AI..." 
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
      </div>
    </ErrorBoundary>
  );
}
