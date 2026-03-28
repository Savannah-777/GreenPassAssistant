// 1. 配置钥匙（放在 Page 外部）
const APP_ID = 'YOUR_ID';
const API_KEY = 'YOUR_KEY';
const SECRET_KEY = 'YOUR_KEY';

Page({
  // 2. 统一的数据仓库
  data: {
    licensePlate: "等待识别",
    statusText: "请对准车牌",
    accessToken: "", 
    isRecording: false
  },

  // 3. 页面启动时自动换取通行证
  onLoad: function() {
    this.getBaiduToken();
  },

  // 获取百度通行证函数
  getBaiduToken: function() {
    // 显示一个加载框，不让用户乱点
    wx.showLoading({ title: 'AI大脑初始化中...' });

    wx.request({
      url: `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${API_KEY}&client_secret=${SECRET_KEY}`,
      method: 'POST',
      success: (res) => {
        wx.hideLoading(); // 拿到通行证了，隐藏加载框
        if (res.data.access_token) {
          this.setData({ accessToken: res.data.access_token });
          console.log("通行证获取成功！");
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showModal({ title: '初始化失败', content: '请检查手机网络' });
      }
    });
  },
  
  // 点击“开始识别并录制”
  startWork: function() {
			if (!this.data.accessToken) {
				wx.showToast({ title: '正在重新连接AI...', icon: 'loading' });
				this.getBaiduToken();
				return;
			}
	
			const ctx = wx.createCameraContext();
			this.setData({ statusText: '正在拍照识别...' });
      ctx.takePhoto({
      quality: 'high',
      success: (res) => {
        // 拍照成功后，调用识别逻辑
        this.doIdentify(res.tempImagePath);
      }
    });
  },

  // 真正调百度接口识别车牌
  doIdentify: function(imagePath) {
    const fs = wx.getFileSystemManager();
    // 将图片转成 Base64
    const base64Img = fs.readFileSync(imagePath, 'base64');

    if (!this.data.accessToken) {
      wx.showToast({ title: '通行证未就绪', icon: 'none' });
      return;
    }

    wx.request({
      url: 'https://aip.baidubce.com/rest/2.0/ocr/v1/license_plate?access_token=' + this.data.accessToken,
      method: 'POST',
      header: { 'content-type': 'application/x-www-form-urlencoded' },
      data: { image: base64Img },
      success: (res) => {
        if (res.data.words_result) {
          const plate = res.data.words_result.number; 
          this.setData({ 
            licensePlate: plate,
            statusText: "识别成功，录制中..." 
          });

          // 识别到车牌后，立即开始录像
          const ctx = wx.createCameraContext();
          ctx.startRecord({
            success: () => { 
              this.setData({ isRecording: true }); 
              wx.showToast({ title: '开始录制', icon: 'success' });
            }
          });
        } else {
          wx.showModal({
            title: '识别失败',
            content: '没看清车牌，请对准后重试',
            showCancel: false
          });
          this.setData({ statusText: '识别失败，请重试' });
        }
      }
    });
  },

  // 点击“停止并自动归档”
  stopWork: function() {
    const ctx = wx.createCameraContext();
    ctx.stopRecord({
      success: (res) => {
        console.log("停止录制，准备归档...");
        setTimeout(() => {
          this.saveToArchive(res.tempVideoPath);
        }, 300);
      }
    });
  },

  // 归档逻辑
  saveToArchive: function(tempPath) {
    const fs = wx.getFileSystemManager();
  
  // 1. 获取当前时间
  const now = new Date();
  
  // 格式化日期：20260315 (用于电脑文件夹分类，或者你可以根据喜好改)
  const dateStr = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
  
  // 格式化时间：15:30 (甲方要求的格式)
  // 注意：文件名里尽量不要带冒号 ":"，因为 Windows 系统不允许文件名带冒号
  // 建议用点 "." 或者直接连写，这里我们遵照甲方，但把冒号换成点，或者告诉甲方系统限制
  const timeStr = `${now.getHours().toString().padStart(2, '0')}.${now.getMinutes().toString().padStart(2, '0')}`;

  // 2. 最终文件名：鲁B66666-15.30.mp4
  const fileName = `${this.data.licensePlate}-${timeStr}.mp4`;
  const newPath = `${wx.env.USER_DATA_PATH}/${fileName}`;
	// 修改 saveToArchive 函数的最后一部分
fs.copyFile({
  srcPath: tempPath,
  destPath: newPath,
  success: () => {
    fs.unlink({ filePath: tempPath });
    
    // --- 核心修改：让视频弹出来，直接发给电脑 ---
    wx.showModal({
      title: '归档成功',
      content: '是否现在发送视频到电脑？',
      confirmText: '去发送',
      success: (res) => {
        if (res.confirm) {
          // 这个接口会打开文件预览，右上角可以直接“发送给朋友”
          wx.openDocument({
            filePath: newPath, 
            fileType: 'mp4',
            showMenu: true, // 必须设为 true，否则没有分享菜单
            success: () => console.log('预览成功'),
            fail: (e) => console.error('预览失败', e)
          });
        }
      }
    });
  }
});
    }
})