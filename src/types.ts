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
