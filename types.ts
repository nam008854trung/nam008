
export enum TranslationStyle {
  DEFAULT = "Phong cách Mặc định",
  TONG_HOP_XUYEN_KHONG = "Tổng Hợp: Xuyên Không + Tu Tiên + Hệ Thống",
  DO_THI_QUY_DI = "Đô Thị Quỷ Dị / Bác Sĩ Điên / Kinh Dị Hài",
  REVIEW_TOM_TAT = "Review / Tóm tắt phim chuyên nghiệp",
  HE_THONG_SSS = "Hệ thống / Thức tỉnh thiên phú SSS / Hack Game",
  MAT_THE_SINH_TON = "Mạt thế / Zombie / Tiến hóa / Sinh tồn",
  TIEN_HIEP_TU_TIEN = "Tiên hiệp / Tu tiên / Vô địch lưu",
  HIEN_DAI_DO_THI = "Hiện đại / Đô thị / Tổng tài",
  CO_DAI_KIEM_HIEP = "Cổ đại / Kiếm hiệp / Cung đấu",
  HAI_HUOC_BECTA = "Hài hước / Bựa / Đời thường"
}

export const SUPPORTED_LANGUAGES = [
  { label: "Tiếng Việt", value: "Vietnamese" },
  { label: "Tiếng Anh (English)", value: "English" },
  { label: "Tiếng Trung (Phồn thể)", value: "Chinese Traditional" },
  { label: "Tiếng Trung (Giản thể)", value: "Chinese Simplified" },
  { label: "Tiếng Nhật (Japanese)", value: "Japanese" },
  { label: "Tiếng Hàn (Korean)", value: "Korean" },
  { label: "Tiếng Pháp (French)", value: "French" },
  { label: "Tiếng Đức (German)", value: "German" },
  { label: "Tiếng Tây Ban Nha (Spanish)", value: "Spanish" },
  { label: "Tiếng Ý (Italian)", value: "Italian" },
  { label: "Tiếng Nga (Russian)", value: "Russian" },
  { label: "Tiếng Thái (Thai)", value: "Thai" },
  { label: "Tiếng Lào (Lao)", value: "Lao" },
  { label: "Tiếng Khmer (Cambodian)", value: "Khmer" },
  { label: "Tiếng Bồ Đào Nha (Portuguese)", value: "Portuguese" },
  { label: "Tiếng Indonesia (Indonesian)", value: "Indonesian" },
  { label: "Tiếng Mã Lai (Malay)", value: "Malay" },
  { label: "Tiếng Thổ Nhĩ Kỳ (Turkish)", value: "Turkish" },
  { label: "Tiếng Ả Rập (Arabic)", value: "Arabic" },
  { label: "Tiếng Ấn Độ (Hindi)", value: "Hindi" },
];

export interface SubtitleBlock {
  id: number;
  timeRange: string;
  text: string;
  translatedText?: string;
  status: 'pending' | 'processing' | 'done' | 'error';
}

export interface SystemLog {
  id: string;
  timestamp: Date;
  message: string;
  type: 'info' | 'success' | 'error';
}
