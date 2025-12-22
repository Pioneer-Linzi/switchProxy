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
     * 使用 osascript 获取授权，授权会被缓存
     * 关键：使用相同的命令模式，确保授权被正确缓存
     */
    async acquireAuth() {
        return new Promise((resolve, reject) => {
            // 使用 osascript 执行一个简单的需要管理员权限的命令
            // 这会触发授权对话框，授权会被缓存
            // 使用与 executeWithAuth 相同的模式，确保授权被正确缓存
            const testCommand = 'networksetup -listallnetworkservices > /dev/null 2>&1';
            const escapedCommand = testCommand
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\$/g, '\\$')
                .replace(/`/g, '\\`');

            const appleScript = `do shell script "${escapedCommand}" with administrator privileges`;
            const osascriptCommand = `osascript -e '${appleScript.replace(/'/g, "'\"'\"'")}'`;

            console.log('获取授权...');
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
                    console.log('授权获取成功');
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
     * 使用 osascript 的授权缓存机制
     * 
     * 注意：macOS 的授权缓存机制可能不够可靠，每次 exec 都会创建新的 osascript 进程
     * 为了确保授权被缓存，我们需要确保在短时间内使用相同的授权上下文
     */
    async executeWithAuth(command) {
        // 转义命令中的特殊字符
        const escapedCommand = command
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\$/g, '\\$')
            .replace(/`/g, '\\`');

        // 使用 osascript 执行命令
        // macOS 的授权缓存基于以下因素：
        // 1. 相同的用户
        // 2. 相同的时间窗口（通常几分钟到几小时）
        // 3. 相同的命令模式
        const appleScript = `do shell script "${escapedCommand}" with administrator privileges`;
        const osascriptCommand = `osascript -e '${appleScript.replace(/'/g, "'\"'\"'")}'`;

        console.log('执行命令（使用授权缓存）:', command.substring(0, 100) + '...');

        return new Promise((resolve, reject) => {
            exec(osascriptCommand, { timeout: 60000 }, (error, stdout, stderr) => {
                if (error) {
                    const errorMsg = error.message || stderr || '';
                    console.error('命令执行失败:', { error: errorMsg, command: command.substring(0, 50) });

                    if (errorMsg.includes('User canceled') || errorMsg.includes('canceled')) {
                        reject(new Error('操作已取消'));
                    } else if (errorMsg.includes('password') || errorMsg.includes('authentication') || errorMsg.includes('not allowed')) {
                        // 授权失败，清除标记，下次会重新获取
                        console.warn('授权失败，清除授权标记');
                        try {
                            if (fs.existsSync(this.authFile)) {
                                fs.unlinkSync(this.authFile);
                            }
                        } catch (e) {
                            // 忽略错误
                        }
                        reject(new Error('需要管理员权限'));
                    } else {
                        reject(new Error(`执行失败: ${errorMsg}`));
                    }
                } else {
                    console.log('命令执行成功');
                    resolve(stdout);
                }
            });
        });
    }
}

module.exports = new AuthHelper();

