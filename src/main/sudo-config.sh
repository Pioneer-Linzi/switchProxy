#!/bin/bash
# 配置 sudo 免密执行 networksetup 命令
# 这个脚本需要管理员权限运行，用于配置 sudo 免密

USERNAME=$(whoami)
SUDOERS_FILE="/etc/sudoers.d/switchproxy"

# 创建 sudoers 配置
sudo tee "$SUDOERS_FILE" > /dev/null <<EOF
# SwitchProxy - 允许执行 networksetup 命令无需密码
$USERNAME ALL=(ALL) NOPASSWD: /usr/sbin/networksetup
EOF

# 设置正确的权限
sudo chmod 0440 "$SUDOERS_FILE"

echo "Sudo 免密配置完成"

