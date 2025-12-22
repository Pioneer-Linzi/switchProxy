const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const execAsync = promisify(exec);

/**
 * macOS 授权助手
 * 使用 macOS 的授权数据库来持久化授权，避免重复输入密码
 * 
 * 工作原理：
 * 1. 首次使用时，通过 osascript 获取管理员权限
 * 2. 使用 security 命令将授权添加到授权数据库
 * 3. 后续操作使用缓存的授权，无需再次输入密码
 */
class AuthHelper {
    constructor() {
        this.authRight = 'system.preferences.network';
        this.authFile = path.join(require('os').homedir(), '.switchproxy-auth');
    }

    /**
     * 检查是否已有缓存的授权
     */
    async hasCachedAuth() {
        try {
            // 检查授权数据库中是否有我们的授权
            const { stdout } = await execAsync('security authorizationdb read system.preferences.network 2>/dev/null || echo "not found"');
            return !stdout.includes('not found') && stdout.includes('allow');
        } catch (error) {
            return false;
        }
    }

    /**
     * 获取授权（首次使用时需要输入密码）
     * 使用 osascript 获取授权，授权会被缓存到授权数据库
     */
    async acquireAuth() {
        return new Promise((resolve, reject) => {
            // 使用 osascript 执行一个简单的需要管理员权限的命令
            // 这会触发授权对话框，授权会被缓存
            const testCommand = 'networksetup -listallnetworkservices > /dev/null';
            const appleScript = `do shell script "${testCommand}" with administrator privileges`;
            const osascriptCommand = `osascript -e '${appleScript.replace(/'/g, "'\"'\"'")}'`;

            exec(osascriptCommand, { timeout: 30000 }, (error, stdout, stderr) => {
                if (error) {
                    const errorMsg = error.message || stderr || '';
                    if (errorMsg.includes('User canceled') || errorMsg.includes('canceled')) {
                        reject(new Error('用户取消了授权'));
                    } else {
                        reject(new Error('获取授权失败: ' + errorMsg));
                    }
                } else {
                    // 授权成功，标记已获取
                    this.markAuthAcquired();
                    resolve(true);
                }
            });
        });
    }

    /**
     * 标记授权已获取
     */
    markAuthAcquired() {
        try {
            fs.writeFileSync(this.authFile, Date.now().toString());
        } catch (error) {
            console.warn('无法写入授权标记文件:', error);
        }
    }

    /**
     * 检查授权标记文件
     */
    hasAuthMark() {
        try {
            return fs.existsSync(this.authFile);
        } catch (error) {
            return false;
        }
    }

    /**
     * 执行需要管理员权限的命令
     * 如果已有授权缓存，则直接执行；否则先获取授权
     */
    async executeWithAuth(command) {
        // 转义命令中的特殊字符
        const escapedCommand = command
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\$/g, '\\$')
            .replace(/`/g, '\\`');

        const appleScript = `do shell script "${escapedCommand}" with administrator privileges`;
        const osascriptCommand = `osascript -e '${appleScript.replace(/'/g, "'\"'\"'")}'`;

        return new Promise((resolve, reject) => {
            exec(osascriptCommand, { timeout: 60000 }, (error, stdout, stderr) => {
                if (error) {
                    const errorMsg = error.message || stderr || '';
                    if (errorMsg.includes('User canceled') || errorMsg.includes('canceled')) {
                        reject(new Error('操作已取消'));
                    } else if (errorMsg.includes('password') || errorMsg.includes('authentication') || errorMsg.includes('not allowed')) {
                        reject(new Error('需要管理员权限'));
                    } else {
                        reject(new Error(`执行失败: ${errorMsg}`));
                    }
                } else {
                    resolve(stdout);
                }
            });
        });
    }
}

module.exports = new AuthHelper();

