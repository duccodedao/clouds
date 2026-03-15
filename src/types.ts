export interface UserData {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  joinDate: string;
  vipLevel: 'USER' | 'VIP' | 'SVIP' | 'VVIP' | 'ENTERPRISE';
  storageUsed: number;
  storageLimit: number;
  balance: number;
  accountStatus: 'ACTIVE' | 'BANNED';
  securitySettings?: {
    pinEnabled: boolean;
    pinHash?: string;
    biometricEnabled: boolean;
  };
}

export interface FileData {
  fileId: string;
  uid: string;
  folderId: string | null;
  fileName: string;
  fileType: string;
  fileSize: number;
  downloadURL: string;
  uploadDate: string;
  visibility: 'PUBLIC' | 'PRIVATE' | 'PASSWORD';
  views: number;
  downloads: number;
  aiTags: string[];
  ocrText: string;
  isStarred?: boolean;
  isDeleted?: boolean;
}

export interface FolderData {
  folderId: string;
  uid: string;
  parentId: string | null;
  folderName: string;
  createdAt: string;
  isStarred?: boolean;
  isDeleted?: boolean;
}

export interface UpgradeRequest {
  requestId: string;
  uid: string;
  userEmail: string;
  userName: string;
  requestedLevel: 'VIP' | 'SVIP' | 'VVIP' | 'ENTERPRISE';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  updatedAt: string;
}

export interface LoginHistory {
  id: string;
  uid: string;
  timestamp: string;
  device: string;
  ip?: string;
  location?: {
    latitude: number;
    longitude: number;
    city?: string;
  };
}

export interface ToastData {
  id: string;
  message: string;
  type: 'SUCCESS' | 'ERROR' | 'INFO';
}

export interface NotificationData {
  id: string;
  uid: string;
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
}

export interface GithubConfig {
  token: string;
  username: string;
  repo: string;
  projectName: string;
  branch: string;
}
