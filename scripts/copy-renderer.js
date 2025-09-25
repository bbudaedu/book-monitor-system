const fs = require('fs');
const path = require('path');

// 確保目標目錄存在
function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// 複製檔案
function copyFile(src, dest) {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
    console.log(`已複製: ${src} -> ${dest}`);
}

// 複製目錄
function copyDir(src, dest) {
    ensureDir(dest);
    const files = fs.readdirSync(src);
    
    files.forEach(file => {
        const srcPath = path.join(src, file);
        const destPath = path.join(dest, file);
        
        if (fs.statSync(srcPath).isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            copyFile(srcPath, destPath);
        }
    });
}

try {
    // 複製 renderer 檔案
    ensureDir('dist/renderer');
    
    // 複製 HTML 和 CSS 檔案
    const rendererFiles = ['index.html', 'styles.css'];
    rendererFiles.forEach(file => {
        const src = path.join('src/renderer', file);
        const dest = path.join('dist/renderer', file);
        if (fs.existsSync(src)) {
            copyFile(src, dest);
        }
    });
    
    // 複製 assets 目錄
    if (fs.existsSync('src/assets')) {
        copyDir('src/assets', 'dist/assets');
    }
    
    console.log('渲染程序檔案複製完成');
} catch (error) {
    console.error('複製檔案時發生錯誤:', error);
    process.exit(1);
}