const update = '2025-10-09 12:05:04';

const quizzes = {
  "py11": {
    "title": "1-1. 四則演算",
    "description": "Python講座「1-1. 四則演算」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py11"
  },
  "py12": {
    "title": "1-2. 変数と画面出力",
    "description": "Python講座「1-2. 変数と画面出力」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py12"
  },
  "py21": {
    "title": "2-1. 条件分岐（if文）",
    "description": "Python講座「2-1. 条件分岐（if文）」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py21"
  },
  "py22a": {
    "title": "2-2. 繰り返し（while文）① A基本問題",
    "description": "Python講座「2-2. 繰り返し（while文）① A基本問題」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py22a"
  },
  "py22b": {
    "title": "2-2. 繰り返し（while文）① B応用問題",
    "description": "Python講座「2-2. 繰り返し（while文）① B応用問題」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py22b"
  },
  "py23a": {
    "title": "2-3. 繰り返し（while文）② A基本問題",
    "description": "Python講座「2-3. 繰り返し（while文）② A基本問題」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py23a"
  },
  "py23b": {
    "title": "2-3. 繰り返し（while文）② B応用問題",
    "description": "Python講座「2-3. 繰り返し（while文）② B応用問題」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py23b"
  },
  "py24a": {
    "title": "2-4. 繰り返し（for文）① A基本問題",
    "description": "Python講座「2-4. 繰り返し（for文）① A基本問題」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py24a"
  },
  "py24b": {
    "title": "2-4. 繰り返し（for文）① B応用問題",
    "description": "Python講座「2-4. 繰り返し（for文）① B応用問題」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py24b"
  },
  "py25a": {
    "title": "2-5. 繰り返し（for文）② A基本問題",
    "description": "Python講座「2-5. 繰り返し（for文）② A基本問題」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py25a"
  },
  "py25b": {
    "title": "2-5. 繰り返し（for文）② B応用問題",
    "description": "Python講座「2-5. 繰り返し（for文）② B応用問題」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py25b"
  },
  "py31a": {
    "title": "3-1. リスト（list） A基本問題",
    "description": "Python講座「3-1. リスト（list） A基本問題」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py31a"
  },
  "py31b": {
    "title": "3-1. リスト（list） B応用問題",
    "description": "Python講座「3-1. リスト（list） B応用問題」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py31b"
  },
  "py32": {
    "title": "3-2. 関数定義（def文）",
    "description": "Python講座「3-2. 関数定義（def文）」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py32"
  },
  "py33a": {
    "title": "3-3. 2次元リスト A基本問題",
    "description": "Python講座「3-3. 2次元リスト A基本問題」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py33a"
  },
  "py33b": {
    "title": "3-3. 2次元リスト B応用問題",
    "description": "Python講座「3-3. 2次元リスト B応用問題」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py33b"
  },
  "py41": {
    "title": "4-1. リニアサーチ（線形探索法）",
    "description": "Python講座「4-1. リニアサーチ（線形探索法）」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py41"
  },
  "py42": {
    "title": "4-2. バイナリサーチ（二分探索法）",
    "description": "Python講座「4-2. バイナリサーチ（二分探索法）」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py42"
  },
  "py43": {
    "title": "4-3. バブルソート（単純交換法）",
    "description": "Python講座「4-3. バブルソート（単純交換法）」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py43"
  },
  "py44": {
    "title": "4-4. 選択ソート（単純選択法）",
    "description": "Python講座「4-4. 選択ソート（単純選択法）」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py44"
  },
  "py45": {
    "title": "4-5. 挿入ソート（単純挿入法）",
    "description": "Python講座「4-5. 挿入ソート（単純挿入法）」の確認テストです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=py45"
  },
  "ipr01": {
    "title": "知的財産権と個人情報・プライバシー①",
    "description": "「知的財産権と個人情報・プライバシー①」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=ipr01"
  },
  "ipr02": {
    "title": "知的財産権と個人情報・プライバシー②",
    "description": "「知的財産権と個人情報・プライバシー②」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=ipr02"
  },
  "ipr03": {
    "title": "知的財産権と個人情報・プライバシー③",
    "description": "「知的財産権と個人情報・プライバシー③」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=ipr03"
  },
  "lc01": {
    "title": "論理回路①",
    "description": "「論理回路①」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=lc01"
  },
  "lc02": {
    "title": "論理回路②",
    "description": "「論理回路②」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=lc02"
  },
  "lc03": {
    "title": "論理回路③",
    "description": "「論理回路③」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=lc03"
  },
  "lc04": {
    "title": "論理回路④",
    "description": "「論理回路④」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=lc04"
  },
  "lc05": {
    "title": "論理回路⑤",
    "description": "「論理回路⑤」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=lc05"
  },
  "lc06": {
    "title": "論理回路⑥",
    "description": "「論理回路⑥」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=lc06"
  },
  "l11": {
    "title": "1-1. 情報とメディア",
    "description": "確認問題「1-1. 情報とメディア」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l11"
  },
  "l12": {
    "title": "1-2. 知的財産権（産業財産権）",
    "description": "確認問題「1-2. 知的財産権（産業財産権）」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l12"
  },
  "l13": {
    "title": "1-3. 知的財産権（著作権）",
    "description": "確認問題「1-3. 知的財産権（著作権）」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l13"
  },
  "l14": {
    "title": "1-4. 個人情報の保護と管理",
    "description": "確認問題「1-4. 個人情報の保護と管理」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l14"
  },
  "l15": {
    "title": "1-5. 不正アクセス",
    "description": "確認問題「1-5. 不正アクセス」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l15"
  },
  "l16": {
    "title": "1-6. 情報セキュリティ",
    "description": "確認問題「1-6. 情報セキュリティ」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l16"
  },
  "l17": {
    "title": "1-7. 問題解決の方法",
    "description": "確認問題「1-7. 問題解決の方法」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l17"
  },
  "l18": {
    "title": "1-8. 情報技術の進歩",
    "description": "確認問題「1-8. 情報技術の進歩」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l18"
  },
  "l19": {
    "title": "1-9. 情報技術の進歩による新たな問題",
    "description": "確認問題「1-9. 情報技術の進歩による新たな問題」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l19"
  },
  "l21": {
    "title": "2-1. コミュニケーション",
    "description": "確認問題「2-1. コミュニケーション」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l21"
  },
  "l22": {
    "title": "2-2. 情報デザイン",
    "description": "確認問題「2-2. 情報デザイン」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l22"
  },
  "l31": {
    "title": "3-1. アナログとデジタル",
    "description": "確認問題「3-1. アナログとデジタル」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l31"
  },
  "l32": {
    "title": "3-2. 2進法と16進法",
    "description": "確認問題「3-2. 2進法と16進法」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l32"
  },
  "l33": {
    "title": "3-3. 2進法の足し算・引き算",
    "description": "確認問題「3-3. 2進法の足し算・引き算」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l33"
  },
  "l34": {
    "title": "3-4. 文字のデジタル表現",
    "description": "確認問題「3-4. 文字のデジタル表現」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l34"
  },
  "l35": {
    "title": "3-5. 音のデジタル表現",
    "description": "確認問題「3-5. 音のデジタル表現」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l35"
  },
  "l36": {
    "title": "3-6. 画像のデジタル表現",
    "description": "確認問題「3-6. 画像のデジタル表現」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l36"
  },
  "l37": {
    "title": "3-7. 動画のデジタル表現",
    "description": "確認問題「3-7. 動画のデジタル表現」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l37"
  },
  "l38": {
    "title": "3-8. データの圧縮",
    "description": "確認問題「3-8. データの圧縮」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l38"
  },
  "l41": {
    "title": "4-1. コンピュータの構成",
    "description": "確認問題「4-1. コンピュータの構成」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l41"
  },
  "l42": {
    "title": "4-2. 論理回路",
    "description": "確認問題「4-2. 論理回路」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l42"
  },
  "l51": {
    "title": "5-1. プログラミング",
    "description": "確認問題「5-1. プログラミング」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l51"
  },
  "l52": {
    "title": "5-2. アルゴリズム",
    "description": "確認問題「5-2. アルゴリズム」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l52"
  },
  "l53": {
    "title": "5-3. モデル化とシミュレーション",
    "description": "確認問題「5-3. モデル化とシミュレーション」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l53"
  },
  "l61": {
    "title": "6-1. 情報通信ネットワークのしくみ",
    "description": "確認問題「6-1. 情報通信ネットワークのしくみ」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l61"
  },
  "l62": {
    "title": "6-2. プロトコル（第１〜３層）",
    "description": "確認問題「6-2. プロトコル（第１〜３層）」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l62"
  },
  "l63": {
    "title": "6-3. プロトコル（第４層：アプリケーション層）",
    "description": "確認問題「6-3. プロトコル（第４層：アプリケーション層）」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l63"
  },
  "l64": {
    "title": "6-4. 暗号化のしくみ",
    "description": "確認問題「6-4. 暗号化のしくみ」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l64"
  },
  "l65": {
    "title": "6-5. 情報システム",
    "description": "確認問題「6-5. 情報システム」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l65"
  },
  "l66": {
    "title": "6-6. データベース",
    "description": "確認問題「6-6. データベース」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l66"
  },
  "l71": {
    "title": "7-1. データの収集",
    "description": "確認問題「7-1. データの収集」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l71"
  },
  "l72": {
    "title": "7-2. データの活用",
    "description": "確認問題「7-2. データの活用」の確認問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=l72"
  },
  "bin01": {
    "title": "2進数と10進数",
    "description": "「2進数と10進数」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=bin01"
  },
  "hex01": {
    "title": "16進数",
    "description": "「16進数」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=hex01"
  },
  "realn01": {
    "title": "固定小数点数と浮動小数点数",
    "description": "「固定小数点数と浮動小数点数」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=realn01"
  },
  "twoscmp01": {
    "title": "補数",
    "description": "「補数」の練習問題です。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=twoscmp01"
  },
  "conv01": {
    "title": "換算",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwdaKYb66pN0Oo6VVgTjhTRw22jDvPl9M8WxlPzXPrsU99R5WV2l0RbXB3-bKCLLeHG/exec?quizId=conv01"
  }
}
window.quizzes = quizzes

const submitForms = {
  "picto25": {
    "title": "ピクトグラム最終課題",
    "description": "中3 ピクトグラム実習最終課題の提出フォームです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=submit&pid=picto25"
  },
  "firefly25": {
    "title": "Firefly実習",
    "description": "中3 Firefly実習の提出フォームです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=submit&pid=firefly25"
  },
  "pysmr25": {
    "title": "Python夏休み自由製作",
    "description": "高1 Python実習 夏休み自由製作の提出フォームです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=submit&pid=pysmr25"
  },
  "pysmr25q": {
    "title": "Python夏休み自由製作（グループ内）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=submit&pid=pysmr25q"
  },
  "pysmr25f": {
    "title": "Python夏休み自由製作（全体）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=submit&pid=pysmr25f"
  },
  "pywtr25": {
    "title": "Python冬休み自由製作",
    "description": "高1 Python実習 冬休み自由製作の提出フォームです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=submit&pid=pywtr25"
  },
  "pywtr25q": {
    "title": "Python冬休み自由製作（グループ内）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=submit&pid=pywtr25q"
  },
  "pywtr25f": {
    "title": "Python冬休み自由製作（全体）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=submit&pid=pywtr25f"
  },
  "yuruchara25": {
    "title": "ゆるキャラ製作",
    "description": "中3 夏休み課題「ゆるキャラ製作」の提出フォームです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=submit&pid=yuruchara25"
  },
  "htmlp": {
    "title": "HTML実習",
    "description": "HTML実習の提出フォームです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=submit&pid=htmlp"
  },
  "htmlpic": {
    "title": "HTML実習 最終課題用写真",
    "description": "HTML実習の最終課題用の写真を提出するフォームです。\n- 撮影をしてきたかどうかの確認です。\n- 自分で撮影したものを1枚添付してください。",
    "url": ""
  }
}
window.submitForms = submitForms

const reviewForms = {
  "picto25": {
    "title": "ピクトグラム最終課題",
    "description": "中3 ピクトグラム実習最終課題の提出フォームです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=review&pid=picto25"
  },
  "firefly25": {
    "title": "Firefly実習",
    "description": "中3 Firefly実習の提出フォームです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=review&pid=firefly25"
  },
  "pysmr25": {
    "title": "Python夏休み自由製作",
    "description": "高1 Python実習 夏休み自由製作の提出フォームです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=review&pid=pysmr25"
  },
  "pysmr25q": {
    "title": "Python夏休み自由製作（グループ内）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=review&pid=pysmr25q"
  },
  "pysmr25f": {
    "title": "Python夏休み自由製作（全体）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=review&pid=pysmr25f"
  },
  "pywtr25": {
    "title": "Python冬休み自由製作",
    "description": "高1 Python実習 冬休み自由製作の提出フォームです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=review&pid=pywtr25"
  },
  "pywtr25q": {
    "title": "Python冬休み自由製作（グループ内）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=review&pid=pywtr25q"
  },
  "pywtr25f": {
    "title": "Python冬休み自由製作（全体）",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=review&pid=pywtr25f"
  },
  "yuruchara25": {
    "title": "ゆるキャラ製作",
    "description": "中3 夏休み課題「ゆるキャラ製作」の提出フォームです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=review&pid=yuruchara25"
  },
  "htmlp": {
    "title": "HTML実習",
    "description": "HTML実習の提出フォームです。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec?mode=review&pid=htmlp"
  },
  "htmlpic": {
    "title": "HTML実習 最終課題用写真",
    "description": "HTML実習の最終課題用の写真を提出するフォームです。\n- 撮影をしてきたかどうかの確認です。\n- 自分で撮影したものを1枚添付してください。",
    "url": ""
  }
}
window.reviewForms = reviewForms

const notices = {
  "noti_ori3": {
    "title": "情報の授業について中3",
    "description": "情報の授業について中3",
    "url": "https://docs.google.com/presentation/d/1DcvbpBRxV5cLzO888sG6vmBi_TWvH1OA0ijyQmcY0jo/edit?usp=drivesdk"
  },
  "noti_ori4": {
    "title": "情報の授業について高1",
    "description": "情報の授業について高1",
    "url": "https://docs.google.com/presentation/d/1WBxMjmE6O3_VwZ6Swq4zDb5MLnIBiLbwfGMOJqd3GcA/edit?usp=drivesdk"
  },
  "noti_htmlpicture": {
    "title": "中3_修学旅行での素材集めについて",
    "description": "2024-10_中3_修学旅行での素材集めについて",
    "url": "https://docs.google.com/document/d/1HX5GqFfmobKCqb3tPePWG9IuRPos8yUFgT7hF1R8gAM/edit?usp=drivesdk"
  },
  "noti_hw_wtr4": {
    "title": "2024-12_高1_冬休みの宿題",
    "description": "2024-12_高1_冬休みの宿題",
    "url": "https://docs.google.com/document/d/14X1uGBHd2X4tLW-UaHR-6_IX8OHbvdtjb0HD3EZINi0/edit?usp=drivesdk"
  },
  "noti_hw_html": {
    "title": "HTML最終課題の提出",
    "description": "HTML最終課題の提出",
    "url": "https://docs.google.com/presentation/d/107suvqG5EMDPoG428EyPlOIni8EkYAS9i3wOMlxjuP8/edit?usp=drivesdk"
  },
  "noti_hw_wtr3": {
    "title": "2024-11_中3_HTML実習最終課題（冬休みの宿題）",
    "description": "2024-11_中3_HTML実習最終課題（冬休みの宿題）",
    "url": "https://docs.google.com/document/d/1zUbnH1Li4gzoSCc99tQWuHX2UJVbjM8AGcnZVvQNkUI/edit?usp=drivesdk"
  },
  "noti_temp_gene-ai": {
    "title": "生成AI指針テンプレ",
    "description": "生成AI指針テンプレ",
    "url": "https://docs.google.com/document/d/18C7jqZzge9PPf55VPpwRGDNowAp4Ug5i-RHvNgkYMdI/edit?usp=drivesdk"
  },
  "noti_hw_feb4": {
    "title": "2025-01_高1_入試期間中の宿題",
    "description": "2025-01_高1_入試期間中の宿題",
    "url": "https://docs.google.com/document/d/1ySgJjtn7fCfeHnR-HnWjCFDQf0z2-G_F_9Z6F34eRD0/edit?usp=drivesdk"
  },
  "noti_hw_data": {
    "title": "2025-02_中3_データの分析_最終課題",
    "description": "2025-02_中3_データの分析_最終課題",
    "url": "https://docs.google.com/document/d/19sKZqGnCX6BfwyFn1IVad-PQQdRpzZ9gHrg9axs4yno/edit?usp=drivesdk"
  },
  "noti_hw_picto": {
    "title": "中3_1学期_ピクトグラム最終課題",
    "description": "中3_1学期_ピクトグラム最終課題",
    "url": "https://docs.google.com/document/d/1t3uv7xG2a-ff5nLCGn-GhXL7af_Za_z6-Y8TQ33Yr5I/edit?usp=drivesdk"
  },
  "noti_hw_smr3": {
    "title": "2025-07_中3_夏休みの宿題",
    "description": "2025-07_中3_夏休みの宿題",
    "url": "https://docs.google.com/document/d/119LV80dwLuLewl-0uarLLyJ55AwPhYCiYQDtmTiPC80/edit?usp=drivesdk"
  },
  "noti_hw_smr4": {
    "title": "2025-07_高1_夏休みの宿題",
    "description": "2025-07_高1_夏休みの宿題",
    "url": "https://docs.google.com/document/d/1VTMZ2CIo2FdJJ1N_iPiLtkUXyIjr0MHKXFSuEctWM7Y/edit?usp=drivesdk"
  },
  "noti_firefly": {
    "title": "Firefly実習",
    "description": "Firefly実習",
    "url": "https://docs.google.com/presentation/d/16By_P147zDyW7M-tUvoxgQiqH3lPgE7nx2whXNFciqk/edit?usp=drivesdk"
  }
}
window.notices = notices

const typing = {
  "L1": {
    "title": "ホームキー基礎（ASDFGHJKL）",
    "description": "ホーム段のキーを使用した単語を入力します。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwfc5sNUoLSV7GYlIIRSgjJ5845YMyL99NeT2AaAj_UxBwznKxIv2QyvuWXPEGcF4DJtw/exec?gameId=L1"
  },
  "L2": {
    "title": "上段＋ホーム（QWERTYUIOP + ASDFGHJKL）",
    "description": "ホーム段＋上段のキーを使用した単語を入力します。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwfc5sNUoLSV7GYlIIRSgjJ5845YMyL99NeT2AaAj_UxBwznKxIv2QyvuWXPEGcF4DJtw/exec?gameId=L2"
  },
  "L3": {
    "title": "全英字（A–Z）",
    "description": "英字全段（ホーム段＋上段＋下段）のキーを使用した単語を入力します。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwfc5sNUoLSV7GYlIIRSgjJ5845YMyL99NeT2AaAj_UxBwznKxIv2QyvuWXPEGcF4DJtw/exec?gameId=L3"
  },
  "L4": {
    "title": "長音(ー)を含む語",
    "description": "英字＋数字キー（ホーム段＋上段＋下段＋ハイフン）のキーを使用した単語を入力します。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwfc5sNUoLSV7GYlIIRSgjJ5845YMyL99NeT2AaAj_UxBwznKxIv2QyvuWXPEGcF4DJtw/exec?gameId=L4"
  },
  "L5": {
    "title": "英字＋数字（A–Z + 0–9）",
    "description": "英字＋数字キー（ホーム段＋上段＋下段＋数字キー）のキーを使用した単語を入力します。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwfc5sNUoLSV7GYlIIRSgjJ5845YMyL99NeT2AaAj_UxBwznKxIv2QyvuWXPEGcF4DJtw/exec?gameId=L5"
  },
  "L6": {
    "title": "実用的な文字列の入力",
    "description": "",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwfc5sNUoLSV7GYlIIRSgjJ5845YMyL99NeT2AaAj_UxBwznKxIv2QyvuWXPEGcF4DJtw/exec?gameId=L6"
  },
  "K1": {
    "title": "鬼滅 基本名詞（短め）",
    "description": "人物名・基本用語（短め）。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwfc5sNUoLSV7GYlIIRSgjJ5845YMyL99NeT2AaAj_UxBwznKxIv2QyvuWXPEGcF4DJtw/exec?gameId=K1"
  },
  "K2": {
    "title": "鬼滅 固有名詞（中〜長め）",
    "description": "フルネーム/地名/編名など中〜長め。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwfc5sNUoLSV7GYlIIRSgjJ5845YMyL99NeT2AaAj_UxBwznKxIv2QyvuWXPEGcF4DJtw/exec?gameId=K2"
  },
  "K3": {
    "title": "呼吸・型名（技）",
    "description": "各呼吸の技名を連結入力（記号・中黒は入力不要）。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwfc5sNUoLSV7GYlIIRSgjJ5845YMyL99NeT2AaAj_UxBwznKxIv2QyvuWXPEGcF4DJtw/exec?gameId=K3"
  },
  "HY1": {
    "title": "百人一首 1–20（全句）",
    "description": "百人一首（スペースは入力不要）",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwfc5sNUoLSV7GYlIIRSgjJ5845YMyL99NeT2AaAj_UxBwznKxIv2QyvuWXPEGcF4DJtw/exec?gameId=HY1"
  },
  "HY2": {
    "title": "百人一首 21–40（全句）",
    "description": "同上。中難度。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwfc5sNUoLSV7GYlIIRSgjJ5845YMyL99NeT2AaAj_UxBwznKxIv2QyvuWXPEGcF4DJtw/exec?gameId=HY2"
  },
  "HY3": {
    "title": "百人一首 41–60（全句）",
    "description": "同上。やや長め多め。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwfc5sNUoLSV7GYlIIRSgjJ5845YMyL99NeT2AaAj_UxBwznKxIv2QyvuWXPEGcF4DJtw/exec?gameId=HY3"
  },
  "HY4": {
    "title": "百人一首 61–80（全句）",
    "description": "同上。長文・歴史仮名多め。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwfc5sNUoLSV7GYlIIRSgjJ5845YMyL99NeT2AaAj_UxBwznKxIv2QyvuWXPEGcF4DJtw/exec?gameId=HY4"
  },
  "HY5": {
    "title": "百人一首 81–100（全句）",
    "description": "同上。長文中心。",
    "url": "https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbwfc5sNUoLSV7GYlIIRSgjJ5845YMyL99NeT2AaAj_UxBwznKxIv2QyvuWXPEGcF4DJtw/exec?gameId=HY5"
  }
}
window.typing = typing
