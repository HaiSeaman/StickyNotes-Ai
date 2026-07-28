"""
StickyNotes AI - 完整功能测试脚本
覆盖所有 Tab、UI 交互、模态框、设置面板、键盘交互等
输出 JSON 格式的详细测试报告
"""
import json
import os
import sys
from pathlib import Path
from datetime import datetime

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

PROJECT_DIR = Path(__file__).resolve().parent.parent
INDEX_HTML = PROJECT_DIR / "index.html"
SCREENSHOT_DIR = PROJECT_DIR / "test" / "screenshots_full"
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
REPORT_FILE = PROJECT_DIR / "test" / "test_full_report.json"

# ==================== Mock window.api ====================
MOCK_API_JS = """
window.__testErrors = [];
window.__testWarnings = [];
window.__testLogs = [];
window.__testActionLog = [];

const origError = console.error;
const origWarn = console.warn;
const origLog = console.log;
console.error = function(...args) { window.__testErrors.push(args.map(a => { try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch(e) { return String(a); } }).join(' ')); origError.apply(console, args); };
console.warn = function(...args) { window.__testWarnings.push(args.map(a => { try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch(e) { return String(a); } }).join(' ')); origWarn.apply(console, args); };
console.log = function(...args) { window.__testLogs.push(args.map(a => { try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch(e) { return String(a); } }).join(' ')); origLog.apply(console, args); };

window.addEventListener('error', function(e) {
    window.__testErrors.push('Uncaught: ' + (e.error ? (e.error.stack || e.error.message) : e.message));
});
window.addEventListener('unhandledrejection', function(e) {
    window.__testErrors.push('UnhandledRejection: ' + (e.reason && (e.reason.stack || e.reason.message) ? (e.reason.stack || e.reason.message) : String(e.reason)));
});

// 通用 mock 工厂：记录调用并返回默认值
function mockFn(name, retVal) {
    return function(...args) {
        window.__testActionLog.push(name + '(' + JSON.stringify(args).slice(0,200) + ')');
        return retVal;
    };
}
function mockAsyncFn(name, retVal) {
    return async function(...args) {
        window.__testActionLog.push(name + '(' + JSON.stringify(args).slice(0,200) + ')');
        return retVal;
    };
}

window.api = {
    // 便签
    loadNotes: mockAsyncFn('loadNotes', [{ id: 'test-1', content: '测试便签内容', todos: [{text:'测试待办',done:false}], createdAt: '2026-07-29T00:00:00Z', updatedAt: '2026-07-29T00:00:00Z' }]),
    saveNotes: mockAsyncFn('saveNotes', true),
    loadArchivedNotes: mockAsyncFn('loadArchivedNotes', []),
    saveArchivedNotes: mockAsyncFn('saveArchivedNotes', true),
    loadTrashedNotes: mockAsyncFn('loadTrashedNotes', []),
    saveTrashedNotes: mockAsyncFn('saveTrashedNotes', true),

    // 聊天归档
    loadArchivedChats: mockAsyncFn('loadArchivedChats', []),
    saveArchivedChats: mockAsyncFn('saveArchivedChats', true),
    loadTrashedChats: mockAsyncFn('loadTrashedChats', []),
    saveTrashedChats: mockAsyncFn('saveTrashedChats', true),

    // 日历
    loadCalendar: mockAsyncFn('loadCalendar', {}),
    saveCalendar: mockAsyncFn('saveCalendar', true),

    // 活跃度
    loadActivity: mockAsyncFn('loadActivity', {}),
    incrementActivity: mockAsyncFn('incrementActivity', true),

    // 同步
    loadSyncConfig: mockAsyncFn('loadSyncConfig', null),
    saveSyncConfig: mockAsyncFn('saveSyncConfig', true),
    testSync: mockAsyncFn('testSync', { success: false, message: '未配置' }),
    uploadSync: mockAsyncFn('uploadSync', { success: false, message: '未配置' }),
    listBackups: mockAsyncFn('listBackups', []),
    deleteBackup: mockAsyncFn('deleteBackup', true),
    restoreBackup: mockAsyncFn('restoreBackup', { success: false, message: '未配置' }),
    onRestoreDone: (cb) => () => {},
    onAutoSyncResult: (cb) => () => {},

    // 设置
    loadSettings: mockAsyncFn('loadSettings', { bgColor: 'default', startupEnabled: false }),
    saveSettings: mockAsyncFn('saveSettings', true),

    // 窗口控制
    minimizeWindow: mockAsyncFn('minimizeWindow', true),
    maximizeWindow: mockAsyncFn('maximizeWindow', true),
    closeWindow: mockAsyncFn('closeWindow', true),
    resizeWindow: mockAsyncFn('resizeWindow', true),
    showWindowForAlarm: mockAsyncFn('showWindowForAlarm', true),
    onAppSavingBeforeQuit: (cb) => () => {},

    // 置顶
    togglePin: mockAsyncFn('togglePin', true),
    getPinState: mockAsyncFn('getPinState', false),
    onPinChanged: (cb) => () => {},

    // AI 配置
    saveAIConfig: mockAsyncFn('saveAIConfig', true),
    loadAIConfig: mockAsyncFn('loadAIConfig', { baseUrl: '', apiKey: '', model: '' }),
    fetchModels: mockAsyncFn('fetchModels', []),
    generateContent: mockAsyncFn('generateContent', { content: 'mock 生成内容' }),
    chat: mockAsyncFn('chat', { success: true }),
    abortChat: mockAsyncFn('abortChat', true),
    onChatChunk: (cb) => () => {},

    // 聊天图片
    saveChatImage: mockAsyncFn('saveChatImage', 'mock-image.png'),
    deleteChatImage: mockAsyncFn('deleteChatImage', true),

    // AI 图片生成
    saveImageConfig: mockAsyncFn('saveImageConfig', true),
    loadImageConfig: mockAsyncFn('loadImageConfig', { baseUrl: '', apiKey: '', model: '' }),
    generateImage: mockAsyncFn('generateImage', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='),
    generateVideo: mockAsyncFn('generateVideo', '/mock/video.mp4'),
    abortVideo: mockAsyncFn('abortVideo', true),
    selectFolder: mockAsyncFn('selectFolder', null),
    saveCustomSize: mockAsyncFn('saveCustomSize', true),
    loadCustomSize: mockAsyncFn('loadCustomSize', []),

    // 窗口固定
    toggleFixed: mockAsyncFn('toggleFixed', true),
    getFixedState: mockAsyncFn('getFixedState', false),
    onFixedChanged: (cb) => () => {},

    // 软件锁
    setLockPin: mockAsyncFn('setLockPin', { success: true }),
    verifyLockPin: mockAsyncFn('verifyLockPin', { success: true }),
    hasLockPin: mockAsyncFn('hasLockPin', false),
    clearLockPin: mockAsyncFn('clearLockPin', { success: true }),

    // 开机启动
    setLaunchAtLogin: mockAsyncFn('setLaunchAtLogin', true),
    getLaunchAtLogin: mockAsyncFn('getLaunchAtLogin', false),

    // 导出
    exportChatToMarkdown: mockAsyncFn('exportChatToMarkdown', true),

    // 剪贴板
    copyTextToClipboard: mockAsyncFn('copyTextToClipboard', true),
    copyImageToClipboard: mockAsyncFn('copyImageToClipboard', true),

    // 便签历史
    saveNoteSnapshot: mockAsyncFn('saveNoteSnapshot', true),
    listNoteHistory: mockAsyncFn('listNoteHistory', []),
    clearNoteHistory: mockAsyncFn('clearNoteHistory', true),
    toggleHistoryLock: mockAsyncFn('toggleHistoryLock', true),

    // 小窗口
    popOutNote: mockAsyncFn('popOutNote', true),
    pushNoteToPopout: mockFn('pushNoteToPopout'),
    onPopoutNoteUpdate: (cb) => () => {},
    onPopoutNoteClose: (cb) => () => {},
    popOutTodo: mockAsyncFn('popOutTodo', true),
    pushTodosToPopout: mockFn('pushTodosToPopout'),
    onPopoutTodoUpdate: (cb) => () => {},
    onPopoutTodoClose: (cb) => () => {},

    // 日志
    getLogs: mockAsyncFn('getLogs', []),
    refreshLogs: mockAsyncFn('refreshLogs', []),
    copyAllLogs: mockAsyncFn('copyAllLogs', true),
    clearLogs: mockAsyncFn('clearLogs', true),
    reportLogs: mockAsyncFn('reportLogs', true),
    reportLogsSync: () => true,
    getLogMeta: mockAsyncFn('getLogMeta', { currentFile: '', totalSize: 0, fileCount: 0 }),

    // 音乐
    musicPickFiles: mockAsyncFn('musicPickFiles', []),
    musicPickFolder: mockAsyncFn('musicPickFolder', { folderPath: '' }),
    musicScanFolder: mockAsyncFn('musicScanFolder', []),
    musicReadMetadata: mockAsyncFn('musicReadMetadata', { title: '', artist: '', album: '' }),
    musicLoadPlaylist: mockAsyncFn('musicLoadPlaylist', []),
    musicSavePlaylist: mockAsyncFn('musicSavePlaylist', true),

    // 电台
    radioLoadConfig: mockAsyncFn('radioLoadConfig', null),
    radioSaveConfig: mockAsyncFn('radioSaveConfig', true),
    radioGetServers: mockAsyncFn('radioGetServers', []),
    radioGetTopStations: mockAsyncFn('radioGetTopStations', []),
    radioGetStationsBySource: mockAsyncFn('radioGetStationsBySource', []),
    radioGetCnHkMusicStations: mockAsyncFn('radioGetCnHkMusicStations', []),
    radioSearch: mockAsyncFn('radioSearch', []),
    radioLoadFavorites: mockAsyncFn('radioLoadFavorites', []),
    radioSaveFavorites: mockAsyncFn('radioSaveFavorites', true),
    radioClearCache: mockAsyncFn('radioClearCache', true),
};

// Mock localStorage 默认数据
if (!localStorage.getItem('aiChats')) {
    localStorage.setItem('aiChats', JSON.stringify([{ id: 'chat-1', title: '测试对话', messages: [{role:'user',content:'你好'},{role:'assistant',content:'你好，我是AI助手'}], createdAt: '2026-07-29T00:00:00Z' }]));
}
"""

TABS = ['notes', 'clock', 'calendar', 'chat', 'create', 'music']


def shot(page, name):
    """截图辅助函数"""
    try:
        page.screenshot(path=str(SCREENSHOT_DIR / f'{name}.png'), full_page=False)
    except Exception as e:
        pass


def click_safe(page, selector, timeout=2000):
    """安全点击，返回是否成功"""
    try:
        page.click(selector, timeout=timeout)
        return True
    except Exception:
        return False


def exists(page, selector):
    """检查元素是否存在"""
    try:
        el = page.query_selector(selector)
        return el is not None
    except Exception:
        return False


def is_visible(page, selector):
    """检查元素是否可见"""
    try:
        el = page.query_selector(selector)
        return el is not None and el.is_visible()
    except Exception:
        return False


def main():
    print("=" * 70)
    print("StickyNotes AI - 完整功能测试")
    print(f"测试时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"测试目标: {INDEX_HTML}")
    print("=" * 70)

    report = {
        'meta': {
            'test_time': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'app_name': 'StickyNotes AI 便签',
            'version': '1.0.0',
            'index_html': str(INDEX_HTML),
            'screenshot_dir': str(SCREENSHOT_DIR),
        },
        'startup': {},
        'tab_tests': {},
        'feature_tests': {},
        'modal_tests': {},
        'settings_tests': {},
        'error_summary': {},
        'summary': {}
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={'width': 1400, 'height': 900},
            locale='zh-CN'
        )
        page = context.new_page()

        # 在页面任何脚本执行前注入 mock API
        context.add_init_script(MOCK_API_JS)

        # 收集控制台消息
        page.on('console', lambda msg: (
            report['error_summary'].setdefault('console_errors', []).append(f'[{msg.type}] {msg.text}')
            if msg.type == 'error'
            else report['error_summary'].setdefault('console_warnings', []).append(f'[{msg.type}] {msg.text}')
            if msg.type == 'warning'
            else None
        ))
        page.on('pageerror', lambda err: report['startup'].setdefault('page_errors', []).append(str(err)))

        # ========== 1. 启动测试 ==========
        print("\n[1/10] 测试页面启动...")
        index_url = INDEX_HTML.as_uri()
        try:
            page.goto(index_url, wait_until='networkidle', timeout=20000)
            report['startup']['load_status'] = 'PASS'
        except Exception as e:
            report['startup']['load_status'] = f'FAIL: {e}'
            try:
                page.goto(index_url, wait_until='domcontentloaded', timeout=15000)
                report['startup']['load_status'] = 'PARTIAL: networkidle 超时但 domcontentloaded 成功'
            except Exception as e2:
                report['startup']['load_status'] = f'FAIL: {e2}'
                report['summary']['overall'] = 'FAIL - 页面无法加载'
                browser.close()
                with open(REPORT_FILE, 'w', encoding='utf-8') as f:
                    json.dump(report, f, ensure_ascii=False, indent=2)
                print(json.dumps(report, ensure_ascii=False, indent=2))
                return

        page.wait_for_timeout(3000)

        # 检查 INIT ERROR 遮罩
        try:
            init_error = page.query_selector('div[style*="INIT ERROR"]')
            if init_error:
                report['startup']['init_error_overlay'] = init_error.text_content()[:500]
                report['startup']['init_error_present'] = True
            else:
                report['startup']['init_error_present'] = False
        except Exception:
            report['startup']['init_error_present'] = False

        # 收集启动后 errors
        test_errors = page.evaluate('window.__testErrors || []')
        test_warnings = page.evaluate('window.__testWarnings || []')
        report['startup']['console_errors'] = test_errors[:30]
        report['startup']['console_warnings'] = test_warnings[:30]
        report['startup']['error_count'] = len(test_errors)
        report['startup']['warning_count'] = len(test_warnings)

        # 检查关键元素是否加载
        key_elements = {
            'window': '#window',
            'titlebar': '.titlebar',
            'notes_tab_btn': 'button[data-tab="notes"]',
            'settings_btn': '#settingsBtn',
            'noteInput': '#noteInput',
        }
        report['startup']['key_elements'] = {}
        for name, sel in key_elements.items():
            report['startup']['key_elements'][name] = exists(page, sel)

        shot(page, '01-startup')
        print(f"  启动状态: {report['startup']['load_status']}")
        print(f"  控制台错误: {report['startup']['error_count']} 条，警告: {report['startup']['warning_count']} 条")

        # ========== 2. Tab 切换测试 ==========
        print("\n[2/10] 测试 6 个 Tab 切换...")
        for tab_name in TABS:
            tab_result = {
                'status': 'PASS',
                'tab_button_exists': False,
                'tab_page_exists': False,
                'tab_page_visible': False,
                'errors_during_switch': [],
                'screenshot': f'tab-{tab_name}.png'
            }
            try:
                tab_btn = page.query_selector(f'button[data-tab="{tab_name}"]')
                tab_result['tab_button_exists'] = tab_btn is not None
                if tab_btn:
                    # 记录切换前的错误数
                    err_before = len(page.evaluate('window.__testErrors || []'))
                    tab_btn.click()
                    page.wait_for_timeout(1000)
                    tab_page = page.query_selector(f'#tab-{tab_name}')
                    tab_result['tab_page_exists'] = tab_page is not None
                    if tab_page:
                        tab_result['tab_page_visible'] = tab_page.is_visible()
                        if not tab_result['tab_page_visible']:
                            tab_result['status'] = 'WARN'
                            tab_result['errors_during_switch'].append('Tab 页面不可见')
                    # 收集新产生的错误
                    err_after = page.evaluate('window.__testErrors || []')
                    new_errors = err_after[err_before:]
                    relevant = [e for e in new_errors if 'musicfile:' not in e and 'chatimg:' not in e and 'radio' not in e.lower()]
                    if relevant:
                        tab_result['errors_during_switch'] = relevant[:3]
                        if tab_result['status'] == 'PASS':
                            tab_result['status'] = 'WARN'
                    shot(page, f'tab-{tab_name}')
                else:
                    tab_result['status'] = 'FAIL'
            except Exception as e:
                tab_result['status'] = 'FAIL'
                tab_result['errors_during_switch'].append(f'测试异常: {e}')

            report['tab_tests'][tab_name] = tab_result
            print(f"  Tab '{tab_name}': {tab_result['status']}")

        # ========== 3. 便签功能测试 ==========
        print("\n[3/10] 测试便签功能...")
        notes_test = {'status': 'PASS', 'checks': {}}
        try:
            page.click('button[data-tab="notes"]')
            page.wait_for_timeout(500)

            # 检查便签列表
            notes_test['checks']['noteList_exists'] = exists(page, '#noteList')
            notes_test['checks']['noteList_item_count'] = len(page.query_selector_all('#noteList .note-item')) if exists(page, '#noteList') else 0

            # 检查搜索框
            notes_test['checks']['noteSearchInput_exists'] = exists(page, '#noteSearchInput')

            # 测试搜索功能
            if exists(page, '#noteSearchInput'):
                try:
                    page.fill('#noteSearchInput', '测试')
                    page.wait_for_timeout(500)
                    notes_test['checks']['search_function'] = 'PASS'
                    page.fill('#noteSearchInput', '')
                    page.wait_for_timeout(300)
                except Exception as e:
                    notes_test['checks']['search_function'] = f'FAIL: {e}'

            # 测试新建便签按钮
            try:
                new_btn = page.query_selector('#newNoteBtn')
                if new_btn:
                    new_btn.click()
                    page.wait_for_timeout(500)
                    notes_test['checks']['newNoteBtn_click'] = 'PASS'
                else:
                    notes_test['checks']['newNoteBtn_click'] = 'FAIL: 按钮不存在'
            except Exception as e:
                notes_test['checks']['newNoteBtn_click'] = f'FAIL: {e}'

            # 检查便签详情区
            notes_test['checks']['contentPanel_exists'] = exists(page, '#contentPanel')
            notes_test['checks']['noteInput_exists'] = exists(page, '#noteInput')

            # 测试在 noteInput 输入内容
            if exists(page, '#noteInput'):
                try:
                    page.fill('#noteInput', '自动化测试输入的便签内容')
                    page.wait_for_timeout(300)
                    notes_test['checks']['noteInput_type'] = 'PASS'
                except Exception as e:
                    notes_test['checks']['noteInput_type'] = f'FAIL: {e}'

            # 测试待办事项
            notes_test['checks']['todoInput_exists'] = exists(page, '#todoInput')
            notes_test['checks']['todoAddBtn_exists'] = exists(page, '#todoAddBtn')
            if exists(page, '#todoInput') and exists(page, '#todoAddBtn'):
                try:
                    page.fill('#todoInput', '测试待办事项')
                    page.click('#todoAddBtn')
                    page.wait_for_timeout(500)
                    todo_count = page.evaluate('document.getElementById("todoCount") ? document.getElementById("todoCount").textContent : "N/A"')
                    notes_test['checks']['todo_add'] = f'PASS (待办数: {todo_count})'
                except Exception as e:
                    notes_test['checks']['todo_add'] = f'FAIL: {e}'

            # 测试归档按钮
            notes_test['checks']['archiveFolderBtn_exists'] = exists(page, '#archiveFolderBtn')
            if exists(page, '#archiveFolderBtn'):
                try:
                    page.click('#archiveFolderBtn')
                    page.wait_for_timeout(500)
                    notes_test['checks']['archiveModal_visible'] = is_visible(page, '#archiveModal')
                    # 关闭
                    close_btn = page.query_selector('#archiveCloseBtn')
                    if close_btn:
                        close_btn.click()
                        page.wait_for_timeout(300)
                except Exception as e:
                    notes_test['checks']['archiveModal_visible'] = f'FAIL: {e}'

            # 测试垃圾桶
            notes_test['checks']['trashFolderBtn_exists'] = exists(page, '#trashFolderBtn')
            if exists(page, '#trashFolderBtn'):
                try:
                    page.click('#trashFolderBtn')
                    page.wait_for_timeout(500)
                    notes_test['checks']['trashModal_visible'] = is_visible(page, '#trashModal')
                    close_btn = page.query_selector('#trashCloseBtn')
                    if close_btn:
                        close_btn.click()
                        page.wait_for_timeout(300)
                except Exception as e:
                    notes_test['checks']['trashModal_visible'] = f'FAIL: {e}'

            # 测试 Markdown 切换
            notes_test['checks']['mdToggleBtn_exists'] = exists(page, '#mdToggleBtn')

            # 测试历史版本按钮
            notes_test['checks']['noteHistoryBtn_exists'] = exists(page, '#noteHistoryBtn')

            shot(page, '03-notes-tab')
        except Exception as e:
            notes_test['status'] = f'FAIL: {e}'
        report['feature_tests']['notes'] = notes_test
        print(f"  便签功能: {notes_test['status']}")

        # ========== 4. 闹钟/计时器功能测试 ==========
        print("\n[4/10] 测试闹钟/计时器功能...")
        clock_test = {'status': 'PASS', 'checks': {}}
        try:
            page.click('button[data-tab="clock"]')
            page.wait_for_timeout(500)

            clock_test['checks']['clockDate_exists'] = exists(page, '#clockDate')
            clock_test['checks']['clockTime_exists'] = exists(page, '#clockTime')
            clock_test['checks']['clockWeek_exists'] = exists(page, '#clockWeek')
            clock_test['checks']['timerPanel_exists'] = exists(page, '#timerPanel')
            clock_test['checks']['alarmPanel_exists'] = exists(page, '#alarmPanel')

            # 测试计时器
            clock_test['checks']['timerH_exists'] = exists(page, '#timerH')
            clock_test['checks']['timerM_exists'] = exists(page, '#timerM')
            clock_test['checks']['timerS_exists'] = exists(page, '#timerS')
            clock_test['checks']['timerStartBtn_exists'] = exists(page, '#timerStartBtn')
            clock_test['checks']['timerResetBtn_exists'] = exists(page, '#timerResetBtn')

            # 测试设置计时器时间
            if exists(page, '#timerS'):
                try:
                    page.fill('#timerS', '5')
                    page.wait_for_timeout(200)
                    clock_test['checks']['timer_set_time'] = 'PASS'
                except Exception as e:
                    clock_test['checks']['timer_set_time'] = f'FAIL: {e}'

            # 测试开始/重置计时器（快速点击重置避免真实倒计时）
            try:
                if exists(page, '#timerStartBtn'):
                    page.click('#timerStartBtn')
                    page.wait_for_timeout(300)
                if exists(page, '#timerResetBtn'):
                    page.click('#timerResetBtn')
                    page.wait_for_timeout(300)
                clock_test['checks']['timer_start_reset'] = 'PASS'
            except Exception as e:
                clock_test['checks']['timer_start_reset'] = f'FAIL: {e}'

            # 测试闹钟
            clock_test['checks']['alarmH_exists'] = exists(page, '#alarmH')
            clock_test['checks']['alarmM_exists'] = exists(page, '#alarmM')
            clock_test['checks']['alarmAddBtn_exists'] = exists(page, '#alarmAddBtn')
            clock_test['checks']['alarmList_exists'] = exists(page, '#alarmList')
            clock_test['checks']['alarmStopBtn_exists'] = exists(page, '#alarmStopBtn')

            # 添加闹钟
            try:
                page.fill('#alarmH', '9')
                page.fill('#alarmM', '30')
                page.click('#alarmAddBtn')
                page.wait_for_timeout(500)
                alarm_count = page.evaluate('document.getElementById("alarmCount") ? document.getElementById("alarmCount").textContent : "N/A"')
                clock_test['checks']['alarm_add'] = f'PASS (闹钟数: {alarm_count})'
            except Exception as e:
                clock_test['checks']['alarm_add'] = f'FAIL: {e}'

            shot(page, '04-clock-tab')
        except Exception as e:
            clock_test['status'] = f'FAIL: {e}'
        report['feature_tests']['clock'] = clock_test
        print(f"  闹钟/计时器: {clock_test['status']}")

        # ========== 5. 日历功能测试 ==========
        print("\n[5/10] 测试日历功能...")
        calendar_test = {'status': 'PASS', 'checks': {}}
        try:
            page.click('button[data-tab="calendar"]')
            page.wait_for_timeout(800)

            calendar_test['checks']['calGrid_exists'] = exists(page, '#calGrid')
            calendar_test['checks']['calTitle_exists'] = exists(page, '#calTitle')
            calendar_test['checks']['calPrevBtn_exists'] = exists(page, '#calPrevBtn')
            calendar_test['checks']['calNextBtn_exists'] = exists(page, '#calNextBtn')
            calendar_test['checks']['calTodayBtn_exists'] = exists(page, '#calTodayBtn')
            calendar_test['checks']['hmSection_exists'] = exists(page, '#hmSection')

            # 获取当前月份标题
            try:
                title_text = page.evaluate('document.getElementById("calTitle") ? document.getElementById("calTitle").textContent : "N/A"')
                calendar_test['checks']['current_month'] = title_text
            except Exception:
                calendar_test['checks']['current_month'] = 'N/A'

            # 测试上一月/下一月
            try:
                if exists(page, '#calNextBtn'):
                    page.click('#calNextBtn')
                    page.wait_for_timeout(300)
                    next_title = page.evaluate('document.getElementById("calTitle") ? document.getElementById("calTitle").textContent : "N/A"')
                    calendar_test['checks']['next_month'] = next_title
                if exists(page, '#calPrevBtn'):
                    page.click('#calPrevBtn')
                    page.wait_for_timeout(300)
                    prev_title = page.evaluate('document.getElementById("calTitle") ? document.getElementById("calTitle").textContent : "N/A"')
                    calendar_test['checks']['prev_month'] = prev_title
            except Exception as e:
                calendar_test['checks']['month_nav'] = f'FAIL: {e}'

            # 测试点击今天按钮
            try:
                if exists(page, '#calTodayBtn'):
                    page.click('#calTodayBtn')
                    page.wait_for_timeout(300)
                    calendar_test['checks']['today_button'] = 'PASS'
            except Exception as e:
                calendar_test['checks']['today_button'] = f'FAIL: {e}'

            # 测试点击日期格
            try:
                day_cell = page.query_selector('#calGrid .cal-day:not(.disabled)')
                if day_cell:
                    day_cell.click()
                    page.wait_for_timeout(500)
                    calendar_test['checks']['click_day'] = 'PASS'
                    calendar_test['checks']['calDetailDate_exists'] = exists(page, '#calDetailDate')
                    calendar_test['checks']['calNoteText_exists'] = exists(page, '#calNoteText')
                    calendar_test['checks']['calSaveTodoBtn_exists'] = exists(page, '#calSaveTodoBtn')
                else:
                    calendar_test['checks']['click_day'] = 'WARN: 未找到可点击日期'
            except Exception as e:
                calendar_test['checks']['click_day'] = f'FAIL: {e}'

            shot(page, '05-calendar-tab')
        except Exception as e:
            calendar_test['status'] = f'FAIL: {e}'
        report['feature_tests']['calendar'] = calendar_test
        print(f"  日历: {calendar_test['status']}")

        # ========== 6. 聊天功能测试 ==========
        print("\n[6/10] 测试聊天功能...")
        chat_test = {'status': 'PASS', 'checks': {}}
        try:
            page.click('button[data-tab="chat"]')
            page.wait_for_timeout(500)

            chat_test['checks']['chatList_exists'] = exists(page, '#chatList')
            chat_test['checks']['chatMessages_exists'] = exists(page, '#chatMessages')
            chat_test['checks']['chatInput_exists'] = exists(page, '#chatInput')
            chat_test['checks']['chatSendBtn_exists'] = exists(page, '#chatSendBtn')
            chat_test['checks']['chatNewBtn_exists'] = exists(page, '#chatNewBtn')
            chat_test['checks']['chatDelBtn_exists'] = exists(page, '#chatDelBtn')
            chat_test['checks']['chatRegenBtn_exists'] = exists(page, '#chatRegenBtn')
            chat_test['checks']['chatUploadBtn_exists'] = exists(page, '#chatUploadBtn')
            chat_test['checks']['chatTitle_exists'] = exists(page, '#chatTitle')

            # 测试在输入框输入
            if exists(page, '#chatInput'):
                try:
                    page.fill('#chatInput', '自动化测试输入消息')
                    page.wait_for_timeout(300)
                    chat_test['checks']['chatInput_type'] = 'PASS'
                except Exception as e:
                    chat_test['checks']['chatInput_type'] = f'FAIL: {e}'

            # 测试新建对话按钮
            try:
                if exists(page, '#chatNewBtn'):
                    page.click('#chatNewBtn')
                    page.wait_for_timeout(500)
                    chat_test['checks']['new_chat'] = 'PASS'
            except Exception as e:
                chat_test['checks']['new_chat'] = f'FAIL: {e}'

            # 不实际发送（避免依赖网络）
            chat_test['checks']['chat_send_skipped'] = '已跳过（需要真实 AI 接口）'

            shot(page, '06-chat-tab')
        except Exception as e:
            chat_test['status'] = f'FAIL: {e}'
        report['feature_tests']['chat'] = chat_test
        print(f"  聊天: {chat_test['status']}")

        # ========== 7. 创作功能测试 ==========
        print("\n[7/10] 测试创作功能...")
        create_test = {'status': 'PASS', 'checks': {}}
        try:
            page.click('button[data-tab="create"]')
            page.wait_for_timeout(500)

            create_test['checks']['createDisplay_exists'] = exists(page, '#createDisplay')
            create_test['checks']['createPlaceholder_exists'] = exists(page, '#createPlaceholder')
            create_test['checks']['createImage_exists'] = exists(page, '#createImage')
            create_test['checks']['createVideo_exists'] = exists(page, '#createVideo')
            create_test['checks']['createPrompt_exists'] = exists(page, '#createPrompt')
            create_test['checks']['createModelSelect_exists'] = exists(page, '#createModelSelect')
            create_test['checks']['createGenBtn_exists'] = exists(page, '#createGenBtn')
            create_test['checks']['createUploadBtn_exists'] = exists(page, '#createUploadBtn')
            create_test['checks']['createSize_exists'] = exists(page, '#createSize')

            # 测试输入提示词
            if exists(page, '#createPrompt'):
                try:
                    page.fill('#createPrompt', '一只可爱的猫咪')
                    page.wait_for_timeout(300)
                    create_test['checks']['prompt_input'] = 'PASS'
                except Exception as e:
                    create_test['checks']['prompt_input'] = f'FAIL: {e}'

            # 测试模型选择
            if exists(page, '#createModelSelect'):
                try:
                    options = page.query_selector_all('#createModelSelect option')
                    create_test['checks']['model_options_count'] = len(options)
                except Exception:
                    pass

            # 不实际点击生成（避免依赖网络）
            create_test['checks']['generate_skipped'] = '已跳过（需要真实 AI 接口）'

            shot(page, '07-create-tab')
        except Exception as e:
            create_test['status'] = f'FAIL: {e}'
        report['feature_tests']['create'] = create_test
        print(f"  创作: {create_test['status']}")

        # ========== 8. 音乐/收音机功能测试 ==========
        print("\n[8/10] 测试音乐/收音机功能...")
        music_test = {'status': 'PASS', 'checks': {}}
        try:
            page.click('button[data-tab="music"]')
            page.wait_for_timeout(800)

            music_test['checks']['musicPanel_exists'] = exists(page, '#musicPanel')
            music_test['checks']['musicPlayer_exists'] = exists(page, '#musicPlayer')
            music_test['checks']['musicList_exists'] = exists(page, '#musicList')
            music_test['checks']['musicEmpty_exists'] = exists(page, '#musicEmpty')
            music_test['checks']['musicAddFilesBtn_exists'] = exists(page, '#musicAddFilesBtn')
            music_test['checks']['musicAddFolderBtn_exists'] = exists(page, '#musicAddFolderBtn')
            music_test['checks']['musicClearBtn_exists'] = exists(page, '#musicClearBtn')
            music_test['checks']['musicSearchInput_exists'] = exists(page, '#musicSearchInput')
            music_test['checks']['musicPlayBtn_exists'] = exists(page, '#musicPlayBtn')
            music_test['checks']['musicPrevBtn_exists'] = exists(page, '#musicPrevBtn')
            music_test['checks']['musicNextBtn_exists'] = exists(page, '#musicNextBtn')
            music_test['checks']['musicModeBtn_exists'] = exists(page, '#musicModeBtn')
            music_test['checks']['musicVolume_exists'] = exists(page, '#musicVolume')
            music_test['checks']['musicProgress_exists'] = exists(page, '#musicProgress')

            # 测试音量调节
            if exists(page, '#musicVolume'):
                try:
                    page.fill('#musicVolume', '50')
                    page.wait_for_timeout(200)
                    music_test['checks']['volume_adjust'] = 'PASS'
                except Exception as e:
                    music_test['checks']['volume_adjust'] = f'FAIL: {e}'

            # 测试搜索框
            if exists(page, '#musicSearchInput'):
                try:
                    page.fill('#musicSearchInput', '测试')
                    page.wait_for_timeout(300)
                    music_test['checks']['search_input'] = 'PASS'
                    page.fill('#musicSearchInput', '')
                except Exception as e:
                    music_test['checks']['search_input'] = f'FAIL: {e}'

            # 收音机
            music_test['checks']['radioFm_exists'] = exists(page, '#radioFm')
            music_test['checks']['radioPlayBtn_exists'] = exists(page, '#radioPlayBtn')
            music_test['checks']['radioPrevBtn_exists'] = exists(page, '#radioPrevBtn')
            music_test['checks']['radioNextBtn_exists'] = exists(page, '#radioNextBtn')
            music_test['checks']['radioFavBtn_exists'] = exists(page, '#radioFavBtn')
            music_test['checks']['radioRefreshBtn_exists'] = exists(page, '#radioRefreshBtn')
            music_test['checks']['radioStations_exists'] = exists(page, '#radioStations')
            music_test['checks']['radioStatusText_exists'] = exists(page, '#radioStatusText')

            shot(page, '08-music-tab')
        except Exception as e:
            music_test['status'] = f'FAIL: {e}'
        report['feature_tests']['music'] = music_test
        print(f"  音乐/收音机: {music_test['status']}")

        # ========== 9. 模态框测试 ==========
        print("\n[9/10] 测试模态框开关...")
        modal_test = {}

        # AI 设置模态框
        try:
            # 先打开设置面板
            page.click('#settingsBtn')
            page.wait_for_timeout(500)
            # 点击 AI 设置
            if exists(page, '#settingsAiBtn'):
                page.click('#settingsAiBtn')
                page.wait_for_timeout(500)
                modal_test['aiModal'] = {
                    'visible': is_visible(page, '#aiModal'),
                    'aiBaseUrl_exists': exists(page, '#aiBaseUrl'),
                    'aiApiKey_exists': exists(page, '#aiApiKey'),
                    'aiModelSelect_exists': exists(page, '#aiModelSelect'),
                    'aiTemperature_exists': exists(page, '#aiTemperature'),
                    'aiPrompt_exists': exists(page, '#aiPrompt'),
                    'modalSaveBtn_exists': exists(page, '#modalSaveBtn'),
                }
                shot(page, '09-ai-modal')
                # 关闭模态框
                close_btn = page.query_selector('#modalCloseBtn')
                if close_btn:
                    close_btn.click()
                    page.wait_for_timeout(300)
        except Exception as e:
            modal_test['aiModal'] = {'error': str(e)}

        # 同步模态框
        try:
            page.click('#settingsBtn')
            page.wait_for_timeout(300)
            if exists(page, '#settingsSyncBtn'):
                page.click('#settingsSyncBtn')
                page.wait_for_timeout(500)
                modal_test['syncModal'] = {
                    'visible': is_visible(page, '#syncModal'),
                    's3Endpoint_exists': exists(page, '#s3Endpoint'),
                    's3Bucket_exists': exists(page, '#s3Bucket'),
                    's3SaveBtn_exists': exists(page, '#s3SaveBtn'),
                    's3TestBtn_exists': exists(page, '#s3TestBtn'),
                    'webdavUrl_exists': exists(page, '#webdavUrl'),
                    'webdavUser_exists': exists(page, '#webdavUser'),
                    'autoSyncToggle_exists': exists(page, '#autoSyncToggle'),
                    'autoSyncInterval_exists': exists(page, '#autoSyncInterval'),
                }
                shot(page, '10-sync-modal')
                close_btn = page.query_selector('#syncCloseBtn')
                if close_btn:
                    close_btn.click()
                    page.wait_for_timeout(300)
        except Exception as e:
            modal_test['syncModal'] = {'error': str(e)}

        # 闹钟音量面板
        try:
            page.click('#settingsBtn')
            page.wait_for_timeout(300)
            if exists(page, '#settingsAlarmVolumeBtn'):
                page.click('#settingsAlarmVolumeBtn')
                page.wait_for_timeout(500)
                modal_test['alarmVolumePanel'] = {
                    'visible': is_visible(page, '#alarmVolumePanel'),
                    'slider_exists': exists(page, '#alarmVolumeSlider'),
                    'value_exists': exists(page, '#alarmVolumeValue'),
                }
                # 测试滑动
                if exists(page, '#alarmVolumeSlider'):
                    try:
                        page.fill('#alarmVolumeSlider', '150')
                        page.wait_for_timeout(200)
                        val = page.evaluate('document.getElementById("alarmVolumeValue") ? document.getElementById("alarmVolumeValue").textContent : "N/A"')
                        modal_test['alarmVolumePanel']['slider_test'] = f'PASS (值: {val})'
                    except Exception as e:
                        modal_test['alarmVolumePanel']['slider_test'] = f'FAIL: {e}'
                # 关闭
                page.keyboard.press('Escape')
                page.wait_for_timeout(300)
        except Exception as e:
            modal_test['alarmVolumePanel'] = {'error': str(e)}

        # 背景颜色面板
        try:
            page.click('#settingsBtn')
            page.wait_for_timeout(300)
            if exists(page, '#settingsPaletteBtn'):
                page.click('#settingsPaletteBtn')
                page.wait_for_timeout(500)
                modal_test['palettePanel'] = {
                    'visible': is_visible(page, '#palettePanel'),
                    'paletteGrid_exists': exists(page, '#paletteGrid'),
                }
                shot(page, '11-palette-panel')
                page.keyboard.press('Escape')
                page.wait_for_timeout(300)
        except Exception as e:
            modal_test['palettePanel'] = {'error': str(e)}

        # 字体大小面板
        try:
            page.click('#settingsBtn')
            page.wait_for_timeout(300)
            if exists(page, '#settingsFontBtn'):
                page.click('#settingsFontBtn')
                page.wait_for_timeout(500)
                modal_test['fontSetPanel'] = {
                    'visible': is_visible(page, '#fontSetPanel'),
                    'fontSizeSlider_exists': exists(page, '#fontSizeSlider'),
                    'fontSizeValue_exists': exists(page, '#fontSizeValue'),
                    'fontSizeResetBtn_exists': exists(page, '#fontSizeResetBtn'),
                }
                if exists(page, '#fontSizeSlider'):
                    try:
                        page.fill('#fontSizeSlider', '18')
                        page.wait_for_timeout(200)
                        val = page.evaluate('document.getElementById("fontSizeValue") ? document.getElementById("fontSizeValue").textContent : "N/A"')
                        modal_test['fontSetPanel']['slider_test'] = f'PASS (值: {val})'
                    except Exception as e:
                        modal_test['fontSetPanel']['slider_test'] = f'FAIL: {e}'
                page.keyboard.press('Escape')
                page.wait_for_timeout(300)
        except Exception as e:
            modal_test['fontSetPanel'] = {'error': str(e)}

        # FM 设置面板
        try:
            page.click('#settingsBtn')
            page.wait_for_timeout(300)
            if exists(page, '#settingsFmBtn'):
                page.click('#settingsFmBtn')
                page.wait_for_timeout(500)
                modal_test['fmSettingsPanel'] = {
                    'visible': is_visible(page, '#fmSettingsPanel'),
                    'fmApiBaseUrl_exists': exists(page, '#fmApiBaseUrl'),
                    'fmTimeout_exists': exists(page, '#fmTimeout'),
                    'fmDefaultCountry_exists': exists(page, '#fmDefaultCountry'),
                    'fmEnableProxy_exists': exists(page, '#fmEnableProxy'),
                    'fmImportBtn_exists': exists(page, '#fmImportBtn'),
                    'fmClearCacheBtn_exists': exists(page, '#fmClearCacheBtn'),
                }
                page.keyboard.press('Escape')
                page.wait_for_timeout(300)
        except Exception as e:
            modal_test['fmSettingsPanel'] = {'error': str(e)}

        # 开机启动面板
        try:
            page.click('#settingsBtn')
            page.wait_for_timeout(300)
            if exists(page, '#settingsStartupBtn'):
                page.click('#settingsStartupBtn')
                page.wait_for_timeout(500)
                modal_test['startupPanel'] = {
                    'visible': is_visible(page, '#startupPanel'),
                    'startupToggle_exists': exists(page, '#startupToggle'),
                }
                page.keyboard.press('Escape')
                page.wait_for_timeout(300)
        except Exception as e:
            modal_test['startupPanel'] = {'error': str(e)}

        # 软件锁 - 设置 PIN
        try:
            if exists(page, '#lockBtn'):
                page.click('#lockBtn')
                page.wait_for_timeout(500)
                modal_test['lockOverlay'] = {
                    'lockOverlay_visible': is_visible(page, '#lockOverlay'),
                    'setPinOverlay_visible': is_visible(page, '#setPinOverlay'),
                    'lockPinInputs_exists': exists(page, '#lockPinInputs'),
                    'setPinInputs_exists': exists(page, '#setPinInputs'),
                    'setPinConfirmInputs_exists': exists(page, '#setPinConfirmInputs'),
                    'setPinConfirmBtn_exists': exists(page, '#setPinConfirmBtn'),
                    'setPinCancelBtn_exists': exists(page, '#setPinCancelBtn'),
                }
                shot(page, '12-lock-screen')
                # 取消
                cancel_btn = page.query_selector('#setPinCancelBtn')
                if cancel_btn:
                    cancel_btn.click()
                    page.wait_for_timeout(300)
                # 如果锁屏仍可见，按 Escape
                if is_visible(page, '#lockOverlay'):
                    page.keyboard.press('Escape')
                    page.wait_for_timeout(300)
        except Exception as e:
            modal_test['lockOverlay'] = {'error': str(e)}

        # 便签历史版本面板
        try:
            # 回到便签 Tab
            page.click('button[data-tab="notes"]')
            page.wait_for_timeout(500)
            # 点击便签进入详情
            note_item = page.query_selector('#noteList .note-item')
            if note_item:
                note_item.click()
                page.wait_for_timeout(500)
                if exists(page, '#noteHistoryBtn'):
                    page.click('#noteHistoryBtn')
                    page.wait_for_timeout(500)
                    modal_test['noteHistoryPanel'] = {
                        'visible': is_visible(page, '#noteHistoryPanel'),
                        'noteHistoryList_exists': exists(page, '#noteHistoryList'),
                    }
                    page.keyboard.press('Escape')
                    page.wait_for_timeout(300)
        except Exception as e:
            modal_test['noteHistoryPanel'] = {'error': str(e)}

        report['modal_tests'] = modal_test
        print(f"  模态框测试完成: {len(modal_test)} 个")

        # ========== 10. 顶部按钮和窗口控制测试 ==========
        print("\n[10/10] 测试顶部按钮和窗口控制...")
        controls_test = {'checks': {}}

        try:
            # 测试固定按钮
            controls_test['checks']['fixedBtn_exists'] = exists(page, '#fixedBtn')
            if exists(page, '#fixedBtn'):
                try:
                    page.click('#fixedBtn')
                    page.wait_for_timeout(300)
                    controls_test['checks']['fixedBtn_click'] = 'PASS'
                except Exception as e:
                    controls_test['checks']['fixedBtn_click'] = f'FAIL: {e}'

            # 测试置顶按钮
            controls_test['checks']['pinBtn_exists'] = exists(page, '#pinBtn')
            if exists(page, '#pinBtn'):
                try:
                    page.click('#pinBtn')
                    page.wait_for_timeout(300)
                    controls_test['checks']['pinBtn_click'] = 'PASS'
                except Exception as e:
                    controls_test['checks']['pinBtn_click'] = f'FAIL: {e}'

            # 测试最小化按钮（mock）
            controls_test['checks']['minBtn_exists'] = exists(page, '#minBtn')

            # 测试最大化按钮
            controls_test['checks']['maxBtn_exists'] = exists(page, '#maxBtn')
            if exists(page, '#maxBtn'):
                try:
                    page.click('#maxBtn')
                    page.wait_for_timeout(300)
                    controls_test['checks']['maxBtn_click'] = 'PASS'
                except Exception as e:
                    controls_test['checks']['maxBtn_click'] = f'FAIL: {e}'

            # 测试关闭按钮（不实际点击关闭，避免窗口消失）
            controls_test['checks']['closeBtn_exists'] = exists(page, '#closeBtn')

            # 测试设置按钮
            controls_test['checks']['settingsBtn_exists'] = exists(page, '#settingsBtn')
            if exists(page, '#settingsBtn'):
                try:
                    page.click('#settingsBtn')
                    page.wait_for_timeout(300)
                    settings_visible = is_visible(page, '#settingsPanel')
                    controls_test['checks']['settingsBtn_click'] = f'PASS (面板可见: {settings_visible})'
                    page.keyboard.press('Escape')
                    page.wait_for_timeout(300)
                except Exception as e:
                    controls_test['checks']['settingsBtn_click'] = f'FAIL: {e}'

            # 测试锁按钮
            controls_test['checks']['lockBtn_exists'] = exists(page, '#lockBtn')

            # 测试窗口大小调整柄
            controls_test['checks']['resizeHandle_exists'] = exists(page, '#resizeHandle')

        except Exception as e:
            controls_test['status'] = f'FAIL: {e}'

        report['settings_tests']['window_controls'] = controls_test
        print(f"  窗口控制: {len(controls_test['checks'])} 项检查")

        # ========== 最终错误汇总 ==========
        print("\n汇总错误信息...")
        all_errors = page.evaluate('window.__testErrors || []')
        all_warnings = page.evaluate('window.__testWarnings || []')
        all_logs = page.evaluate('window.__testLogs || []')
        all_actions = page.evaluate('window.__testActionLog || []')

        report['error_summary'] = {
            'total_errors': len(all_errors),
            'total_warnings': len(all_warnings),
            'total_logs': len(all_logs),
            'total_api_calls': len(all_actions),
            'errors': all_errors[:50],
            'warnings': all_warnings[:30],
            'api_calls_sample': all_actions[:30],
        }

        # 按类型分类错误
        error_categories = {}
        for err in all_errors:
            if 'musicfile:' in err:
                cat = 'musicfile 协议加载'
            elif 'chatimg:' in err:
                cat = 'chatimg 协议加载'
            elif 'Radio' in err or 'radio' in err.lower():
                cat = '电台功能'
            elif 'popout' in err.lower() or 'Popout' in err:
                cat = '小窗口（popout）'
            elif 'UnhandledRejection' in err:
                cat = '未处理 Promise 拒绝'
            elif 'Uncaught' in err:
                cat = '未捕获异常'
            else:
                cat = '其他'
            error_categories[cat] = error_categories.get(cat, 0) + 1
        report['error_summary']['error_categories'] = error_categories

        # 最终截图
        page.click('button[data-tab="notes"]')
        page.wait_for_timeout(500)
        shot(page, '99-final')

        browser.close()

    # ========== 总结 ==========
    tab_pass = sum(1 for r in report['tab_tests'].values() if r['status'] == 'PASS')
    tab_warn = sum(1 for r in report['tab_tests'].values() if r['status'] == 'WARN')
    tab_fail = sum(1 for r in report['tab_tests'].values() if r['status'] == 'FAIL')

    feat_pass = sum(1 for r in report['feature_tests'].values() if isinstance(r.get('status'), str) and r['status'].startswith('PASS'))
    feat_fail = sum(1 for r in report['feature_tests'].values() if isinstance(r.get('status'), str) and r['status'].startswith('FAIL'))

    total_errors = report['error_summary'].get('total_errors', 0)
    total_warnings = report['error_summary'].get('total_warnings', 0)

    if report['startup'].get('load_status', '').startswith('FAIL'):
        overall = 'FAIL - 页面无法加载'
    elif tab_fail > 0 or feat_fail > 0:
        overall = f'FAIL - {tab_fail} 个 Tab 失败，{feat_fail} 个功能失败'
    elif total_errors > 0:
        overall = f'WARN - 所有 Tab 可用，但有 {total_errors} 个控制台错误'
    else:
        overall = 'PASS - 全部测试通过'

    report['summary'] = {
        'overall': overall,
        'tab_stats': {
            'pass': tab_pass,
            'warn': tab_warn,
            'fail': tab_fail,
            'total': len(TABS)
        },
        'feature_stats': {
            'pass': feat_pass,
            'fail': feat_fail,
            'total': len(report['feature_tests'])
        },
        'modal_count': len(report['modal_tests']),
        'error_count': total_errors,
        'warning_count': total_warnings,
        'api_call_count': report['error_summary'].get('total_api_calls', 0),
        'screenshot_count': len(list(SCREENSHOT_DIR.glob('*.png'))) if SCREENSHOT_DIR.exists() else 0,
    }

    # 保存报告
    with open(REPORT_FILE, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print("\n" + "=" * 70)
    print("测试完成！")
    print(f"总体结论: {overall}")
    print(f"Tab 测试: {tab_pass} 通过, {tab_warn} 警告, {tab_fail} 失败")
    print(f"功能测试: {feat_pass} 通过, {feat_fail} 失败")
    print(f"模态框测试: {len(report['modal_tests'])} 个")
    print(f"控制台错误: {total_errors} 条，警告: {total_warnings} 条")
    print(f"API 调用记录: {report['error_summary'].get('total_api_calls', 0)} 次")
    print(f"截图数量: {report['summary']['screenshot_count']} 张")
    print(f"截图目录: {SCREENSHOT_DIR}")
    print(f"详细报告: {REPORT_FILE}")
    print("=" * 70)


if __name__ == '__main__':
    main()
