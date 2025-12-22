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
        this.sudoersFile = '/etc/sudoers.d/switchproxy';
        this.lastAuthTime = 0;
        this.authCacheDuration = Infinity; // 永久缓存（直到用户注销或重启）
        this.helperInstalled = false;
    }

    /**
     * 检查是否已配置 sudo 免密
     */
    async hasSudoNopasswd() {
        try {
            const { stdout } = await execAsync(`sudo -n networksetup -listallnetworkservices > /dev/null 2>&1 && echo "OK" || echo "FAIL"`);
            return stdout.trim() === 'OK';
        } catch (error) {
            return false;
        }
    }

    /**
     * 配置 sudo 免密（需要管理员权限）
     * 这是实现永久免密的关键方法
     */
    async configureSudoNopasswd() {
        const username = require('os').userInfo().username;
        const sudoersContent = `${username} ALL=(ALL) NOPASSWD: /usr/sbin/networksetup\n`;

        // 使用 osascript 执行 sudo 命令来配置免密
        const command = `echo "${sudoersContent}" | sudo tee ${this.sudoersFile} > /dev/null && sudo chmod 0440 ${this.sudoersFile}`;
        const escapedCommand = command
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\$/g, '\\$')
            .replace(/`/g, '\\`');

        const appleScript = `do shell script "${escapedCommand}" with administrator privileges`;
        const osascriptCommand = `osascript -e '${appleScript.replace(/'/g, "'\"'\"'")}'`;

        return new Promise((resolve, reject) => {
            console.log('配置 sudo 免密（需要输入一次密码）...');
            exec(osascriptCommand, { timeout: 30000 }, (error, stdout, stderr) => {
                if (error) {
                    const errorMsg = error.message || stderr || '';
                    if (errorMsg.includes('User canceled') || errorMsg.includes('canceled')) {
                        reject(new Error('用户取消了授权'));
                    } else {
                        reject(new Error('配置 sudo 免密失败: ' + errorMsg));
                    }
                } else {
                    console.log('Sudo 免密配置成功');
                    this.markAuthAcquired();
                    resolve(true);
                }
            });
        });
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
     * 使用 osascript 获取授权，授权会被缓存到用户会话
     */
    async acquireAuth() {
        // 如果最近刚获取过授权（30秒内），直接返回成功
        if (this.isRecentlyAuthorized()) {
            console.log('最近已获取授权（30秒内），跳过重复获取');
            return true;
        }

        // 检查授权标记文件
        // 如果标记文件存在，说明之前已经获取过授权
        // macOS 的授权缓存应该仍然有效（在用户会话期间）
        // 但如果授权缓存失效，仍然会提示输入密码
        const hasMark = this.hasAuthMark();
        if (hasMark) {
            console.log('授权标记文件存在，尝试使用缓存的授权');
            console.log('如果授权缓存有效，不会提示输入密码');
            // 不立即返回，继续执行获取授权的流程
            // 如果授权缓存有效，osascript 不会提示输入密码
        } else {
            console.log('授权标记文件不存在，需要首次获取授权');
        }

        return new Promise((resolve, reject) => {
            // 使用 osascript 执行一个简单的需要管理员权限的命令
            // 这会触发授权对话框，授权会被缓存到用户会话
            const testCommand = 'networksetup -listallnetworkservices > /dev/null 2>&1';
            const escapedCommand = testCommand
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\$/g, '\\$')
                .replace(/`/g, '\\`');

            const appleScript = `do shell script "${escapedCommand}" with administrator privileges`;
            const osascriptCommand = `osascript -e '${appleScript.replace(/'/g, "'\"'\"'")}'`;

            console.log('获取授权（首次使用需要输入密码）...');
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
                    console.log('授权获取成功，创建授权标记文件');
                    this.lastAuthTime = Date.now();
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
     * 如果文件存在，认为授权已永久获取（直到用户注销或重启）
     */
    hasAuthMark() {
        try {
            const exists = fs.existsSync(this.authFile);
            if (exists) {
                // 读取文件内容，检查时间戳
                const content = fs.readFileSync(this.authFile, 'utf8');
                console.log('授权标记文件内容:', content);
            }
            return exists;
        } catch (error) {
            console.error('检查授权标记文件失败:', error);
            return false;
        }
    }

    /**
     * 检查授权是否刚刚获取（避免重复获取）
     */
    isRecentlyAuthorized() {
        const now = Date.now();
        const timeSinceLastAuth = now - this.lastAuthTime;
        // 如果最近30秒内获取过授权，认为仍然有效
        return timeSinceLastAuth < 30000;
    }

    /**
     * 执行需要管理员权限的命令
     * 优先使用 sudo 免密，如果未配置则使用 osascript
     */
    async executeWithAuth(command) {
        // 首先检查是否已配置 sudo 免密
        const hasSudo = await this.hasSudoNopasswd();

        if (hasSudo) {
            // 使用 sudo 免密执行（不需要密码）
            console.log('使用 sudo 免密执行命令（不需要密码）');
            return new Promise((resolve, reject) => {
                exec(`sudo ${command}`, { timeout: 60000 }, (error, stdout, stderr) => {
                    if (error) {
                        const errorMsg = error.message || stderr || '';
                        console.error('命令执行失败:', { error: errorMsg });
                        reject(new Error(`执行失败: ${errorMsg}`));
                    } else {
                        console.log('命令执行成功（使用 sudo 免密）');
                        resolve(stdout);
                    }
                });
            });
        }

        // 如果未配置 sudo 免密，使用 osascript（需要授权缓存）
        console.log('未配置 sudo 免密，使用 osascript（需要授权缓存）');

        // 转义命令中的特殊字符
        const escapedCommand = command
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\$/g, '\\$')
            .replace(/`/g, '\\`');

        const appleScript = `do shell script "${escapedCommand}" with administrator privileges`;
        const osascriptCommand = `osascript -e '${appleScript.replace(/'/g, "'\"'\"'")}'`;

        const hasMark = this.hasAuthMark();
        console.log('执行命令（使用 osascript 授权）:', command.substring(0, 100) + '...');
        console.log('授权标记文件存在:', hasMark, hasMark ? '(应该不需要密码)' : '(需要输入密码)');

        return new Promise((resolve, reject) => {
            exec(osascriptCommand, { timeout: 60000 }, (error, stdout, stderr) => {
                if (error) {
                    const errorMsg = error.message || stderr || '';
                    console.error('命令执行失败:', { error: errorMsg, command: command.substring(0, 50) });

                    if (errorMsg.includes('User canceled') || errorMsg.includes('canceled')) {
                        reject(new Error('操作已取消'));
                    } else if (errorMsg.includes('password') || errorMsg.includes('authentication') || errorMsg.includes('not allowed')) {
                        console.warn('授权失败，需要重新授权');
                        reject(new Error('需要管理员权限'));
                    } else {
                        reject(new Error(`执行失败: ${errorMsg}`));
                    }
                } else {
                    console.log('命令执行成功');
                    this.lastAuthTime = Date.now();
                    this.markAuthAcquired();
                    resolve(stdout);
                }
            });
        });
    }
}

module.exports = new AuthHelper();

