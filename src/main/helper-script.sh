#!/bin/bash
# SwitchProxy 辅助脚本 - 用于执行需要管理员权限的网络设置命令
# 此脚本通过 osascript 的授权缓存机制，实现长期授权（直到用户注销或重启）

# 获取参数（注意：参数顺序已调整，ACTION 在最后）
SERVICE=$1
TYPE=$2
HOST=$3
PORT=$4
ACTION=$5

case "$ACTION" in
  "set-http")
    networksetup -setwebproxy "$SERVICE" "$HOST" "$PORT"
    networksetup -setsecurewebproxy "$SERVICE" "$HOST" "$PORT"
    ;;
  "enable-http")
    networksetup -setwebproxystate "$SERVICE" on
    networksetup -setsecurewebproxystate "$SERVICE" on
    ;;
  "disable-http")
    networksetup -setwebproxystate "$SERVICE" off
    networksetup -setsecurewebproxystate "$SERVICE" off
    ;;
  "set-socks")
    networksetup -setsocksfirewallproxy "$SERVICE" "$HOST" "$PORT"
    ;;
  "enable-socks")
    networksetup -setsocksfirewallproxystate "$SERVICE" on
    ;;
  "disable-socks")
    networksetup -setsocksfirewallproxystate "$SERVICE" off
    ;;
  "set-and-enable-http")
    networksetup -setwebproxy "$SERVICE" "$HOST" "$PORT"
    networksetup -setsecurewebproxy "$SERVICE" "$HOST" "$PORT"
    networksetup -setwebproxystate "$SERVICE" on
    networksetup -setsecurewebproxystate "$SERVICE" on
    ;;
  "set-and-enable-socks")
    networksetup -setsocksfirewallproxy "$SERVICE" "$HOST" "$PORT"
    networksetup -setsocksfirewallproxystate "$SERVICE" on
    ;;
  "disable-all")
    networksetup -setwebproxystate "$SERVICE" off
    networksetup -setsecurewebproxystate "$SERVICE" off
    networksetup -setsocksfirewallproxystate "$SERVICE" off
    ;;
  *)
    echo "Unknown action: $ACTION"
    exit 1
    ;;
esac

exit 0

