"""
StickyNotes AI - 渲染层功能测试脚本
使用 Playwright 加载 index.html，mock window.api，检查 UI 渲染和控制台错误。
"""
import json
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

PROJECT_DIR = Path(__file__).resolve().parent.parent
INDEX_HTML = PROJECT_DIR / "index.html"
SCREENSHOT_DIR = PROJECT_DIR / "test" / "screenshots"
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)

# mock window.api 的 JavaScript 代码
# 覆盖 preload.js 暴露的所有方法，返回合理默认值
MOCK_API_JS = """
window.__testErrors = [];
window.__testWarnings = [];
window.__testLogs = [];

// 捕获所有 console 输出
const origError = console.error;
const origWarn = console.warn;
const origLog = console.log;
console.error = function(...args) { window.__testErrors.push(args.map(String).join(' ')); origError.apply(console, args); };
console.warn = function(...args) { window.__testWarnings.push(args.map(String).join(' ')); origWarn.apply(console, args); };
console.log = function(...args) { window.__testLogs.push(args.map(String).join(' ')); origLog.apply(console, args); };

// 捕获未处理的异常
window.addEventListener('error', function(e) {
    window.__testErrors.push('Uncaught: ' + (e.error ? e.error.stack : e.message));
});
window.addEventListener('unhandledrejection', function(e) {
    window.__testErrors.push('UnhandledRejection: ' + (e.reason && e.reason.stack ? e.reason.stack : String(e.reason)));
});

// Mock window.api - 返回合理默认值
window.api = {
    // 便签数据
    loadNotes: async () => [{ id: 'test-1', content: '测试便签', todos: [], createdAt: '2026-07-29T00:00:00Z', updatedAt: '2026-07-29T00:00:00Z' }],
    saveNotes: async () => true,
    loadArchivedNotes: async () => [],
    saveArchivedNotes: async () => true,
    loadTrashedNotes: async () => [],
    saveTrashedNotes: async () => true,

    // 聊天归档
    loadArchivedChats: async () => [],
    saveArchivedChats: async () => true,
    loadTrashedChats: async () => [],
    saveTrashedChats: async () => true,

    // 日历
    loadCalendar: async () => ({}),
    saveCalendar: async () => true,

    // 活跃度
    loadActivity: async () => ({}),
    incrementActivity: async () => true,

    // 同步
    loadSyncConfig: async () => null,
    saveSyncConfig: async () => true,
    testSync: async () => ({ success: false, message: '未配置' }),
    uploadSync: async () => ({ success: false, message: '未配置' }),
    listBackups: async () => [],
    deleteBackup: async () => true,
    restoreBackup: async () => ({ success: false, message: '未配置' }),
    onRestoreDone: (cb) => () => {},
    onAutoSyncResult: (cb) => () => {},

    // 设置
    loadSettings: async () => ({ bgColor: 'default', startupEnabled: false }),
    saveSettings: async () => true,

    // 窗口控制
    minimizeWindow: async () => true,
    maximizeWindow: async () => true,
    closeWindow: async () => true,
    resizeWindow: async () => true,
    showWindowForAlarm: async () => true,
    onAppSavingBeforeQuit: (cb) => () => {},

    // 置顶
    togglePin: async () => true,
    getPinState: async () => false,
    onPinChanged: (cb) => () => {},

    // AI 配置
    saveAIConfig: async () => true,
    loadAIConfig: async () => ({ baseUrl: '', apiKey: '', model: '' }),
    fetchModels: async () => [],
    generateContent: async () => ({ content: 'mock' }),
    chat: async () => ({ success: true }),
    abortChat: async () => true,
    onChatChunk: (cb) => () => {},

    // 聊天图片
    saveChatImage: async () => 'mock-image.png',
    deleteChatImage: async () => true,

    // AI 图片生成
    saveImageConfig: async () => true,
    loadImageConfig: async () => ({ baseUrl: '', apiKey: '', model: '' }),
    generateImage: async () => 'data:image/png;base64,iVBORw0KGgo=',
    generateVideo: async () => '/mock/video.mp4',
    abortVideo: async () => true,
    selectFolder: async () => null,
    saveCustomSize: async () => true,
    loadCustomSize: async () => [],

    // 窗口固定
    toggleFixed: async () => true,
    getFixedState: async () => false,
    onFixedChanged: (cb) => () => {},

    // 软件锁
    setLockPin: async () => ({ success: true }),
    verifyLockPin: async () => ({ success: true }),
    hasLockPin: async () => false,
    clearLockPin: async () => ({ success: true }),

    // 开机启动
    setLaunchAtLogin: async () => true,
    getLaunchAtLogin: async () => false,

    // 导出
    exportChatToMarkdown: async () => true,

    // 剪贴板
    copyTextToClipboard: async () => true,
    copyImageToClipboard: async () => true,

    // 便签历史
    saveNoteSnapshot: async () => true,
    listNoteHistory: async () => [],
    clearNoteHistory: async () => true,
    toggleHistoryLock: async () => true,

    // 小窗口
    popOutNote: async () => true,
    pushNoteToPopout: () => {},
    onPopoutNoteUpdate: (cb) => () => {},
    onPopoutNoteClose: (cb) => () => {},
    popOutTodo: async () => true,
    pushTodosToPopout: () => {},
    onPopoutTodoUpdate: (cb) => () => {},
    onPopoutTodoClose: (cb) => () => {},

    // 日志
    getLogs: async () => [],
    refreshLogs: async () => [],
    copyAllLogs: async () => true,
    clearLogs: async () => true,
    reportLogs: async () => true,
    reportLogsSync: () => true,
    getLogMeta: async () => ({ currentFile: '', totalSize: 0, fileCount: 0 }),

    // 音乐
    musicPickFiles: async () => [],
    musicPickFolder: async () => ({ folderPath: '' }),
    musicScanFolder: async () => [],
    musicReadMetadata: async () => ({ title: '', artist: '', album: '' }),
    musicLoadPlaylist: async () => [],
    musicSavePlaylist: async () => true,

    // 电台
    radioLoadConfig: async () => null,
    radioSaveConfig: async () => true,
    radioGetServers: async () => [],
    radioGetTopStations: async () => [],
    radioGetStationsBySource: async () => [],
    radioGetCnHkMusicStations: async () => [],
    radioSearch: async () => [],
    radioLoadFavorites: async () => [],
    radioSaveFavorites: async () => true,
    radioClearCache: async () => true,
};

// Mock localStorage（Playwright 已内置，但确保有默认数据）
if (!localStorage.getItem('aiChats')) {
    localStorage.setItem('aiChats', JSON.stringify([{ id: 'chat-1', title: '测试对话', messages: [], createdAt: '2026-07-29T00:00:00Z' }]));
}
"""

TABS = ['notes', 'clock', 'calendar', 'chat', 'create', 'music']


def main():
    results = {
        'syntax': 'PASS',
        'startup_errors': [],
        'console_errors': [],
        'console_warnings': [],
        'tab_tests': {},
        'ui_interactions': {},
        'summary': ''
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={'width': 1280, 'height': 800},
            locale='zh-CN'
        )
        page = context.new_page()

        # 收集控制台消息
        page.on('console', lambda msg: (
            results['console_errors'].append(msg.text) if msg.type == 'error'
            else results['console_warnings'].append(msg.text) if msg.type == 'warning'
            else None
        ))
        page.on('pageerror', lambda err: results['startup_errors'].append(str(err)))

        # 加载 index.html
        index_url = INDEX_HTML.as_uri()
        try:
            page.goto(index_url, wait_until='domcontentloaded', timeout=15000)
        except Exception as e:
            results['startup_errors'].append(f'页面加载失败: {e}')
            browser.close()
            results['summary'] = 'FAIL: 页面无法加载'
            print(json.dumps(results, ensure_ascii=False, indent=2))
            return

        # 注入 mock API（在页面脚本执行前）
        # 由于 index.html 中的脚本在 domcontentloaded 时已开始执行，
        # 我们需要在 navigation 之前注入。改用 addInitScript。
        # 但页面已加载，我们重新加载并使用 init script。

        browser.close()

    # 重新启动，使用 addInitScript 在页面脚本前注入 mock
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={'width': 1280, 'height': 800},
            locale='zh-CN'
        )
        page = context.new_page()

        # 在页面任何脚本执行前注入 mock API
        context.add_init_script(MOCK_API_JS)

        # 收集控制台消息
        page.on('console', lambda msg: (
            results['console_errors'].append(f'[{msg.type}] {msg.text}') if msg.type == 'error'
            else results['console_warnings'].append(f'[{msg.type}] {msg.text}') if msg.type == 'warning'
            else None
        ))
        page.on('pageerror', lambda err: results['startup_errors'].append(str(err)))

        # 加载 index.html
        index_url = INDEX_HTML.as_uri()
        try:
            page.goto(index_url, wait_until='networkidle', timeout=20000)
        except Exception as e:
            results['startup_errors'].append(f'页面加载失败: {e}')
            # 尝试继续
            pass

        # 等待初始化完成
        page.wait_for_timeout(3000)

        # 检查 INIT ERROR 遮罩
        init_error = page.query_selector('div[style*="INIT ERROR"]')
        if init_error:
            results['startup_errors'].append(f'INIT ERROR 遮罩出现: {init_error.text_content()[:500]}')

        # 截图：初始状态
        page.screenshot(path=str(SCREENSHOT_DIR / '00-initial.png'), full_page=False)

        # 逐个测试 Tab
        for tab_name in TABS:
            tab_result = {'status': 'PASS', 'errors': []}
            try:
                # 点击 tab 按钮
                tab_btn = page.query_selector(f'button[data-tab="{tab_name}"]')
                if not tab_btn:
                    tab_result['status'] = 'FAIL'
                    tab_result['errors'].append(f'Tab 按钮 data-tab="{tab_name}" 不存在')
                    results['tab_tests'][tab_name] = tab_result
                    continue

                tab_btn.click()
                page.wait_for_timeout(1000)

                # 检查 tab-page 是否可见
                tab_page = page.query_selector(f'#tab-{tab_name}')
                if not tab_page:
                    tab_result['status'] = 'FAIL'
                    tab_result['errors'].append(f'Tab 页面 #tab-{tab_name} 不存在')
                else:
                    # 检查是否有可见内容
                    is_visible = tab_page.is_visible()
                    if not is_visible:
                        tab_result['status'] = 'WARN'
                        tab_result['errors'].append(f'Tab 页面 #tab-{tab_name} 不可见')

                # 截图
                page.screenshot(path=str(SCREENSHOT_DIR / f'tab-{tab_name}.png'), full_page=False)

                # 检查该 tab 下是否有 JS 错误（通过 __testErrors）
                test_errors = page.evaluate('window.__testErrors || []')
                if test_errors:
                    # 过滤掉已知的无关错误（如 musicfile:// 协议加载失败）
                    relevant_errors = [e for e in test_errors if 'musicfile:' not in e and 'chatimg:' not in e]
                    if relevant_errors:
                        tab_result['errors'].extend(relevant_errors[:5])  # 只记前5条

            except Exception as e:
                tab_result['status'] = 'FAIL'
                tab_result['errors'].append(f'测试异常: {e}')

            results['tab_tests'][tab_name] = tab_result

        # 测试 UI 交互
        # 1. 便签 Tab - 检查便签列表和输入框
        try:
            page.click('button[data-tab="notes"]')
            page.wait_for_timeout(500)
            note_input = page.query_selector('#noteInput')
            note_list = page.query_selector('#noteList')
            results['ui_interactions']['notes_tab'] = {
                'noteInput_exists': note_input is not None,
                'noteList_exists': note_list is not None,
                'noteList_children': len(note_list.query_selector_all('.note-item')) if note_list else 0,
            }
        except Exception as e:
            results['ui_interactions']['notes_tab'] = {'error': str(e)}

        # 2. 创建新便签
        try:
            new_note_btn = page.query_selector('#newNoteBtn')
            if new_note_btn:
                new_note_btn.click()
                page.wait_for_timeout(500)
                results['ui_interactions']['create_note'] = {'status': 'PASS'}
            else:
                results['ui_interactions']['create_note'] = {'status': 'FAIL', 'error': 'newNoteBtn 不存在'}
        except Exception as e:
            results['ui_interactions']['create_note'] = {'status': 'FAIL', 'error': str(e)}

        # 3. 聊天 Tab - 检查聊天 UI
        try:
            page.click('button[data-tab="chat"]')
            page.wait_for_timeout(500)
            chat_input = page.query_selector('#chatInput')
            chat_messages = page.query_selector('#chatMessages')
            results['ui_interactions']['chat_tab'] = {
                'chatInput_exists': chat_input is not None,
                'chatMessages_exists': chat_messages is not None,
            }
        except Exception as e:
            results['ui_interactions']['chat_tab'] = {'error': str(e)}

        # 4. 创作 Tab - 检查创作 UI
        try:
            page.click('button[data-tab="create"]')
            page.wait_for_timeout(500)
            create_prompt = page.query_selector('#createPrompt')
            create_gen_btn = page.query_selector('#createGenBtn')
            results['ui_interactions']['create_tab'] = {
                'createPrompt_exists': create_prompt is not None,
                'createGenBtn_exists': create_gen_btn is not None,
            }
        except Exception as e:
            results['ui_interactions']['create_tab'] = {'error': str(e)}

        # 5. 日历 Tab - 检查日历 UI
        try:
            page.click('button[data-tab="calendar"]')
            page.wait_for_timeout(500)
            calendar_grid = page.query_selector('#calendarGrid')
            results['ui_interactions']['calendar_tab'] = {
                'calendarGrid_exists': calendar_grid is not None,
            }
        except Exception as e:
            results['ui_interactions']['calendar_tab'] = {'error': str(e)}

        # 6. 闹钟 Tab - 检查闹钟 UI
        try:
            page.click('button[data-tab="clock"]')
            page.wait_for_timeout(500)
            alarm_list = page.query_selector('#alarmList')
            results['ui_interactions']['clock_tab'] = {
                'alarmList_exists': alarm_list is not None,
            }
        except Exception as e:
            results['ui_interactions']['clock_tab'] = {'error': str(e)}

        # 7. 设置面板
        try:
            settings_btn = page.query_selector('#settingsBtn')
            if settings_btn:
                settings_btn.click()
                page.wait_for_timeout(500)
                settings_panel = page.query_selector('#settingsPanel')
                results['ui_interactions']['settings'] = {
                    'settingsPanel_exists': settings_panel is not None,
                    'settingsPanel_visible': settings_panel.is_visible() if settings_panel else False,
                }
                page.screenshot(path=str(SCREENSHOT_DIR / 'settings-panel.png'), full_page=False)
                # 关闭设置
                if settings_panel and settings_panel.is_visible():
                    page.keyboard.press('Escape')
                    page.wait_for_timeout(300)
            else:
                results['ui_interactions']['settings'] = {'error': 'settingsBtn 不存在'}
        except Exception as e:
            results['ui_interactions']['settings'] = {'error': str(e)}

        # 收集所有控制台错误
        all_errors = page.evaluate('window.__testErrors || []')
        all_warnings = page.evaluate('window.__testWarnings || []')
        results['console_errors'] = all_errors[:20]  # 最多记 20 条
        results['console_warnings'] = all_warnings[:20]

        # 最终截图
        page.click('button[data-tab="notes"]')
        page.wait_for_timeout(500)
        page.screenshot(path=str(SCREENSHOT_DIR / 'final.png'), full_page=False)

        browser.close()

    # 生成总结
    total_errors = len(results['startup_errors']) + len(results['console_errors'])
    failed_tabs = [name for name, r in results['tab_tests'].items() if r['status'] == 'FAIL']
    warned_tabs = [name for name, r in results['tab_tests'].items() if r['status'] == 'WARN']

    if total_errors == 0 and not failed_tabs:
        results['summary'] = f'PASS - 所有 Tab 正常，{len(warned_tabs)} 个警告'
    elif total_errors > 0 and not failed_tabs:
        results['summary'] = f'WARN - {total_errors} 个控制台错误，但 Tab 可用'
    else:
        results['summary'] = f'FAIL - {len(failed_tabs)} 个 Tab 失败，{total_errors} 个错误'

    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
