/* ==================== 日历模块（v2.0 重构版，TS 迁移） ====================
 * 职责：月视图渲染、日期导航、当日闹钟管理、当日待办管理
 * 布局：单一内容框
 *       上部 60%：日历日期信息（月视图网格）
 *       下部 40%：左=闹钟信息 / 右=待办事项
 * 数据：
 *   - 闹钟：通过 window.api.saveCalendar 存入 calendar.json
 *           同时同步到 renderer.ts 全局 alarms 队列（带 date 字段）
 *   - 待办：复用 renderer.ts 全局 notes 数组 + saveNotesToDisk()
 *           通过 note.targetDate 字段关联日期
 * 通信：原 window.CalendarModule 命名空间，现改为 ES module export
 * 设计要点：
 *   - 日期统一使用 ISO 格式（YYYY-MM-DD），避免跨天/跨时区误判
 *   - DOM 操作使用 createElement/textContent，不用 innerHTML 拼接，防 XSS
 *   - 切换月份时增量更新单元格选中状态，不全量销毁重建
 * ================================================================ */

import { genId, previewText, toISODate, isToday } from '../lib/shared-utils.js';

/* ==================== window 全局对象获取函数 ====================
 * 这些变量/函数由 renderer.ts 在 window 作用域提供，本模块通过安全的 window 函数封装访问。
 */
function getGlobalNotes(): any[] | null {
    return Array.isArray((window as any).notes) ? (window as any).notes : null;
}
function getGlobalAlarms(): any[] | null {
    return Array.isArray((window as any).alarms) ? (window as any).alarms : null;
}
function getGlobalSaveAlarms(): Function | null {
    return typeof (window as any).saveAlarms === 'function' ? (window as any).saveAlarms : null;
}
function getGlobalSaveNotesToDisk(): Function | null {
    return typeof (window as any).saveNotesToDisk === 'function' ? (window as any).saveNotesToDisk : null;
}
function getGlobalRenderNoteList(): Function | null {
    return typeof (window as any).renderNoteList === 'function' ? (window as any).renderNoteList : null;
}
function getGlobalSwitchNote(): Function | null {
    return typeof (window as any).switchNote === 'function' ? (window as any).switchNote : null;
}

/* ==================== 状态 ==================== */
let calData: any = {};          // { "2026-07-16": { alarms: [{h,m,s,label,sound,enabled}] } }
let viewYear: number = 0;       // 当前显示的年
let viewMonth: number = 0;      // 当前显示的月（0-11）
let selectedDate: string | null = null;   // 选中的日期（ISO YYYY-MM-DD）

/* ==================== 热力图状态（重构版） ==================== */
let activityData: any = {};     // 活跃度数据 { "2026-07-16": { note: 2, todo: 3 } }
const HM_DAYS = 365;            // 热力图展示天数（一整年）
let elHmContainer: HTMLElement, elHmSummary: HTMLElement, elHmScroll: HTMLElement;
let hmResizeObserver: ResizeObserver | null = null;
let hmResizeTimer: ReturnType<typeof setTimeout> | null = null;
// M9 修复：保存 resize 监听器引用，destroy() 中正确移除，避免内存泄漏
let hmResizeHandler: (() => void) | null = null;
let hmLastCellSize = 0;         // 上次渲染的方块尺寸，用于 resize 时跳过尺寸未变的重绘，减少回流
let hmLastDataVersion = -1;     // 上次渲染的数据版本号，用于数据未变时跳过整片 DOM 重建（切 tab 场景）
let activityVersion = 0;        // 数据版本号：每次 loadActivityData 刷新后递增（activityData 唯一刷新入口）

/* ==================== DOM 引用 ==================== */
const $ = (id: string): any => document.getElementById(id);
let elGrid: HTMLElement, elTitle: HTMLElement, elPrevBtn: HTMLElement, elNextBtn: HTMLElement, elTodayBtn: HTMLElement;
// 下半部左：闹钟区
let elDetailDate: HTMLElement, elAlarmInputArea: HTMLElement, elAlarmTime: HTMLInputElement, elAlarmLabel: HTMLInputElement, elSaveAlarmBtn: HTMLElement, elDayAlarmList: HTMLElement;
// 下半部右：待办区
let elTodoTitle: HTMLElement, elTodoInputArea: HTMLElement, elNoteText: HTMLInputElement, elSaveTodoBtn: HTMLElement, elNoteList: HTMLElement;

/* ==================== 工具函数 ==================== */
// toISODate / isToday 已抽取至 shared-utils.js（全局共享，避免重复定义）

// 获取月份中文标题
function monthTitle(y: number, m: number): string {
    return y + '年' + (m + 1) + '月';
}

// 获取某月第一天是星期几（0=周日）
function firstDayOfMonth(y: number, m: number): number {
    return new Date(y, m, 1).getDay();
}

// 获取某月天数
function daysInMonth(y: number, m: number): number {
    return new Date(y, m + 1, 0).getDate();
}

// 获取某日期的闹钟数据（不存在则创建空对象）
function getDayEntry(iso: string): any {
    if (!calData[iso]) calData[iso] = { alarms: [] };
    if (!calData[iso].alarms) calData[iso].alarms = [];
    return calData[iso];
}

// 从 renderer.ts 全局 notes 数组中筛选绑定到指定日期的便签
function getNotesForDate(iso: string): any[] {
    const globalNotes = getGlobalNotes();
    if (!globalNotes) return [];
    return globalNotes.filter((n: any) => n.targetDate === iso);
}

/* ==================== 数据读写 ==================== */
async function loadData(): Promise<void> {
    try {
        calData = await window.api.loadCalendar();
        if (!calData || typeof calData !== 'object') calData = {};
        // M10 修复：为旧数据中无 id 的闹钟补充唯一 id，使删除操作基于 id 而非数组下标
        for (const dateKey of Object.keys(calData)) {
            const entry = calData[dateKey];
            if (entry && Array.isArray(entry.alarms)) {
                for (const al of entry.alarms) {
                    if (!al.id) al.id = genId();
                }
            }
        }
    } catch (e: any) {
        console.error('加载日历数据失败:', e);
        calData = {};
    }
}

// saveData 失败时抛出，让调用方感知错误并提示用户（原来仅 console.error 静默吞）
async function saveData(): Promise<void> {
    try {
        await window.api.saveCalendar(calData);
    } catch (e: any) {
        console.error('保存日历数据失败:', e);
        throw e; // 重新抛出，由 addAlarm/removeAlarm/saveAlarm 处理用户提示
    }
}

/* ==================== 热力图渲染（重构版：Flex 双层布局） ====================
 * 布局策略：外层 .hm-container 水平排列各周列（gap:1px 左右间距），
 *          内层 .hm-week 垂直排列 7 天（gap:2px 上下间距）。
 * 相比旧版 CSS Grid + column-gap/row-gap，两个独立 flex 容器的 gap 互不干扰，
 * 彻底解决之前 4 次修改间距不生效的问题。
 */

/**
 * 加载活跃度数据（从 main.js 的 activity.json 读取）
 */
async function loadActivityData(): Promise<void> {
    try {
        activityData = await window.api.loadActivity();
        if (!activityData || typeof activityData !== 'object') activityData = {};
    } catch (e: any) {
        console.error('加载活跃度数据失败:', e);
        activityData = {};
    }
    // 数据版本号递增：触发 renderHeatmap 的增量更新判定（替代 JSON.stringify 判等）
    activityVersion++;
}

/**
 * 计算某天的活跃度总分 = 完成待办数 + 便签编辑数
 */
function hmScore(iso: string): number {
    const a = activityData[iso];
    if (!a) return 0;
    return (a.note || 0) + (a.todo || 0);
}

/**
 * 分数映射到 0-4 颜色层级
 * 0=浅灰，1=浅青，2=中青，3=深青，4=最深青蓝
 */
function hmLevel(score: number): number {
    if (score <= 0) return 0;
    if (score === 1) return 1;
    if (score <= 3) return 2;
    if (score <= 6) return 3;
    return 4;
}

/**
 * 渲染热力图：最近 365 天，按周列排布
 * 每列一周（周日→周六），共约 53 列
 * 方块尺寸根据容器宽度自适应，窗口缩放时重新渲染
 * @param force - 强制重建 DOM（数据更新后必须传 true，否则会被尺寸相同判断跳过）
 */
function renderHeatmap(force?: boolean): void {
    if (!elHmContainer) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 起始日期：365 天前，对齐到周日（getDay()=0）
    const start = new Date(today);
    start.setDate(start.getDate() - HM_DAYS + 1);
    start.setDate(start.getDate() - start.getDay());

    // 用 Math.round 而非 Math.floor：DST 切换日一天不是整 86400000ms（23 或 25 小时），
    // floor 会在"春令时往前拨"时少算一天，round 取最近整数修正此偏差
    const totalDays = Math.round((today.getTime() - start.getTime()) / 86400000) + 1;
    const totalWeeks = Math.ceil(totalDays / 7);

    // 自适应方块尺寸：根据滚动容器宽度反推
    const containerWidth = (elHmScroll && elHmScroll.clientWidth) || 600;
    // 每列宽度 = cellSize + 1px gap，总宽 = totalWeeks * (cellSize + 1) - 1
    let cellSize = Math.floor((containerWidth + 1) / totalWeeks - 1);
    // 365 天约 53 列，方块会较小：最小 6px、最大 14px
    cellSize = Math.max(6, Math.min(14, cellSize));

    // 数据指纹：用版本号判等（替代 JSON.stringify，避免 365 天数据每次 stringify 的 O(n) 开销）
    // activityVersion 只在 loadActivityData 刷新数据后递增，切 tab 场景下版本号不变 → 完全跳过 DOM 操作，零回流
    const dataChanged = activityVersion !== hmLastDataVersion;
    const sizeChanged = cellSize !== hmLastCellSize;

    // 1. 尺寸和数据都没变，且非强制重绘 → 跳过（resize 时尺寸相同、切 tab 时数据相同）
    if (!force && !sizeChanged && !dataChanged && elHmContainer.childElementCount > 0) {
        return;
    }

    // 2. 只有数据变了（尺寸没变）→ 复用现有 DOM 节点，只更新 className 和 title
    // 避免每次切 tab 都重建 424 个节点的回流开销
    if (!sizeChanged && dataChanged && elHmContainer.childElementCount > 0) {
        const cells = elHmContainer.querySelectorAll('.hm-cell');
        let totalActive = 0;
        let activeDays = 0;
        cells.forEach(cell => {
            const iso = (cell as HTMLElement).dataset.iso;
            if (!iso) return;
            // future 节点保持原样，不参与统计
            if (cell.classList.contains('future')) return;
            const score = hmScore(iso);
            // 重置 className：保留 hm-cell + future 标志，重新计算 lvl-N
            cell.className = 'hm-cell lvl-' + hmLevel(score);
            const a = activityData[iso] || { note: 0, todo: 0 };
            (cell as HTMLElement).title = iso + '：完成 ' + (a.todo || 0) + ' 个待办，编辑 ' + (a.note || 0) + ' 次便签';
            if (score > 0) {
                totalActive += score;
                activeDays++;
            }
        });
        if (elHmSummary) {
            elHmSummary.textContent = '近一年共 ' + totalActive + ' 次活跃，' + activeDays + ' 天有记录';
        }
        hmLastDataVersion = activityVersion;
        return;  // 不重建 DOM，零回流
    }

    // 3. 尺寸变了或强制重绘 → 全量重建（首次渲染、resize 改变方块大小、force=true）
    hmLastCellSize = cellSize;
    hmLastDataVersion = activityVersion;

    const frag = document.createDocumentFragment();
    let totalActive = 0;
    let activeDays = 0;

    // 按周（列）构建，每列内按天（行）构建
    for (let w = 0; w < totalWeeks; w++) {
        const weekCol = document.createElement('div');
        weekCol.className = 'hm-week';
        for (let d = 0; d < 7; d++) {
            const cellDate = new Date(start);
            cellDate.setDate(start.getDate() + w * 7 + d);
            const iso = toISODate(cellDate);
            const cell = document.createElement('div');
            cell.className = 'hm-cell';
            cell.style.width = cellSize + 'px';
            cell.style.height = cellSize + 'px';
            // 记录 iso 到 dataset，后续数据更新时可按 iso 反查节点做增量更新
            cell.dataset.iso = iso;

            if (cellDate > today) {
                cell.classList.add('future');
            } else {
                const score = hmScore(iso);
                cell.classList.add('lvl-' + hmLevel(score));
                if (score > 0) {
                    totalActive += score;
                    activeDays++;
                }
                // 原生 title 提示框：显示日期和操作数量
                const a = activityData[iso] || { note: 0, todo: 0 };
                (cell as HTMLElement).title = iso + '：完成 ' + (a.todo || 0) + ' 个待办，编辑 ' + (a.note || 0) + ' 次便签';
            }
            weekCol.appendChild(cell);
        }
        frag.appendChild(weekCol);
    }

    elHmContainer.innerHTML = '';
    elHmContainer.appendChild(frag);

    if (elHmSummary) {
        elHmSummary.textContent = '近一年共 ' + totalActive + ' 次活跃，' + activeDays + ' 天有记录';
    }
}

/**
 * 重新加载并渲染热力图（切换 tab 或活跃度更新后调用）
 */
async function refreshHeatmap(): Promise<void> {
    await loadActivityData();
    renderHeatmap(true);  // 强制重绘：数据已更新，必须重建 DOM
}

/**
 * 绑定响应式重绘：窗口缩放时按新宽度重算方块尺寸
 */
function bindHeatmapResize(): void {
    if (hmResizeObserver) return;
    if (!elHmScroll) return;
    if (typeof ResizeObserver === 'undefined') {
        // M9 修复：保存监听器引用以便 destroy() 中移除
        hmResizeHandler = () => scheduleHeatmapRedraw();
        window.addEventListener('resize', hmResizeHandler);
        return;
    }
    hmResizeObserver = new ResizeObserver(() => scheduleHeatmapRedraw());
    hmResizeObserver.observe(elHmScroll);
}

function scheduleHeatmapRedraw(): void {
    if (hmResizeTimer) clearTimeout(hmResizeTimer);
    hmResizeTimer = setTimeout(() => {
        hmResizeTimer = null;
        renderHeatmap();
    }, 150);
}

/* ==================== 月视图渲染 ==================== */
function renderMonthView(): void {
    if (!elGrid) return;
    elTitle.textContent = monthTitle(viewYear, viewMonth);

    const firstWeekday = firstDayOfMonth(viewYear, viewMonth);
    const monthDays = daysInMonth(viewYear, viewMonth);
    const prevMonthDays = daysInMonth(viewYear, viewMonth - 1);
    const totalCells = 42;

    const frag = document.createDocumentFragment();

    for (let i = 0; i < totalCells; i++) {
        let cellDay: number, cellDate: string, isOtherMonth = false;

        if (i < firstWeekday) {
            isOtherMonth = true;
            cellDay = prevMonthDays - firstWeekday + i + 1;
            const pm = viewMonth === 0 ? 11 : viewMonth - 1;
            const py = viewMonth === 0 ? viewYear - 1 : viewYear;
            cellDate = toISODate(new Date(py, pm, cellDay));
        } else if (i < firstWeekday + monthDays) {
            cellDay = i - firstWeekday + 1;
            cellDate = toISODate(new Date(viewYear, viewMonth, cellDay));
        } else {
            isOtherMonth = true;
            cellDay = i - firstWeekday - monthDays + 1;
            const nm = viewMonth === 11 ? 0 : viewMonth + 1;
            const ny = viewMonth === 11 ? viewYear + 1 : viewYear;
            cellDate = toISODate(new Date(ny, nm, cellDay));
        }

        const cell = document.createElement('div');
        cell.className = 'cal-cell';
        if (isOtherMonth) cell.classList.add('other-month');
        if (isToday(cellDate)) cell.classList.add('today');
        if (selectedDate === cellDate) cell.classList.add('selected');

        const dayNotes = getNotesForDate(cellDate);
        const dayEntry = calData[cellDate];
        const hasAlarms = dayEntry && dayEntry.alarms && dayEntry.alarms.length > 0;

        const dayLabel = document.createElement('span');
        dayLabel.className = 'cal-cell-day';
        dayLabel.textContent = String(cellDay);
        cell.appendChild(dayLabel);

        if (dayNotes.length > 0 || hasAlarms) {
            const dotsWrap = document.createElement('div');
            dotsWrap.className = 'cal-cell-dots';
            if (dayNotes.length > 0) {
                const dot = document.createElement('span');
                dot.className = 'cal-cell-dot';
                dotsWrap.appendChild(dot);
            }
            if (hasAlarms) {
                const dot = document.createElement('span');
                dot.className = 'cal-cell-dot alarm';
                dotsWrap.appendChild(dot);
            }
            cell.appendChild(dotsWrap);
        }

        cell.dataset.date = cellDate;
        cell.addEventListener('click', () => selectDate(cellDate));
        frag.appendChild(cell);
    }

    elGrid.innerHTML = '';
    elGrid.appendChild(frag);
}

/* ==================== 日期选中 → 渲染下半部详情 ==================== */
function selectDate(iso: string): void {
    selectedDate = iso;

    // 更新单元格选中状态（只改 class，不重建 DOM）
    const cells = elGrid.querySelectorAll('.cal-cell');
    cells.forEach(c => {
        c.classList.toggle('selected', (c as HTMLElement).dataset.date === iso);
    });

    renderDayDetail(iso);
}

// 渲染下半部：左=当日闹钟 + 右=当日待办
function renderDayDetail(iso: string): void {
    const todayLabel = isToday(iso) ? '（今天）' : '';
    elDetailDate.textContent = '📅 ' + iso + todayLabel;
    elTodoTitle.textContent = '📌 ' + iso + todayLabel;
    elAlarmInputArea.style.display = '';
    elTodoInputArea.style.display = '';

    // 左下：当日闹钟列表
    elDayAlarmList.innerHTML = '';
    const entry = calData[iso];
    const dayAlarms = (entry && entry.alarms) || [];
    if (dayAlarms.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'cal-empty-hint';
        empty.textContent = '暂无闹钟';
        elDayAlarmList.appendChild(empty);
    } else {
        dayAlarms.forEach((al: any, idx: number) => {
            const item = document.createElement('div');
            item.className = 'cal-alarm-item';

            const time = document.createElement('span');
            time.className = 'cal-alarm-item-time';
            time.textContent = String(al.h).padStart(2, '0') + ':' + String(al.m).padStart(2, '0');
            item.appendChild(time);

            const label = document.createElement('span');
            label.className = 'cal-alarm-item-label';
            label.textContent = al.label || '（无标签）';
            item.appendChild(label);

            const del = document.createElement('button');
            del.className = 'cal-alarm-item-del';
            del.textContent = '✕';
            del.title = '删除此闹钟';
            del.addEventListener('click', () => {
                // M10 修复：基于 alarmId 删除，避免列表重排后 idx 失效
                const alarmId = al.id;
                if (!alarmId) {
                    alert('闹钟数据异常（缺少 id），无法删除');
                    return;
                }
                // 捕获 removeAlarm 异步失败，避免 unhandledrejection
                removeAlarm(iso, alarmId).catch((e: any) => alert('删除闹钟失败：' + (e && e.message || e)));
            });
            item.appendChild(del);

            elDayAlarmList.appendChild(item);
        });
    }

    // 右下：当日待办便签列表
    elNoteList.innerHTML = '';
    const dayNotes = getNotesForDate(iso);
    if (dayNotes.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'cal-empty-hint';
        empty.textContent = '暂无便签';
        elNoteList.appendChild(empty);
    } else {
        dayNotes.forEach((note: any) => {
            const item = document.createElement('div');
            item.className = 'cal-note-item';

            const text = document.createElement('span');
            text.className = 'cal-note-item-text';
            text.textContent = previewText(note.content, 30);
            item.appendChild(text);

            item.title = '点击跳转到此便签';
            item.addEventListener('click', () => {
                const switchFn = getGlobalSwitchNote();
                if (switchFn) {
                    switchFn(note.id);
                    const notesTab = document.querySelector('.tab[data-tab="notes"]');
                    if (notesTab) (notesTab as HTMLElement).click();
                }
            });

            const del = document.createElement('button');
            del.className = 'cal-note-item-del';
            del.textContent = '✕';
            del.title = '删除此便签';
            del.addEventListener('click', (e: Event) => {
                e.stopPropagation();
                deleteNote(note.id);
            });
            item.appendChild(del);

            elNoteList.appendChild(item);
        });
    }
}

/* ==================== 闹钟管理 ==================== */
// addAlarm 改为 async 并 await saveData，避免 fire-and-forget 导致数据丢失
async function addAlarm(iso: string, h: any, m: any, label: string): Promise<void> {
    // 时间边界校验：防止外部传入越界值导致闹钟逻辑异常
    h = Math.max(0, Math.min(23, parseInt(h, 10) || 0));
    m = Math.max(0, Math.min(59, parseInt(m, 10) || 0));
    const entry = getDayEntry(iso);
    // M10 修复：为 calData 中的 alarm 添加唯一 id，删除时基于 id 而非数组下标
    const alarmId = genId();
    const alarm = { id: alarmId, h: h, m: m, s: 0, label: label || '', sound: 'default', enabled: true };
    const globalAlarm = {
        id: alarmId,
        h: h, m: m, s: 0,
        enabled: true, triggered: false,
        label: label || '',
        sound: 'default',
        date: iso
    };

    // 事务性暂存：先在内存中插入
    entry.alarms.push(alarm);
    const globalAlarms = getGlobalAlarms();
    const saveAlarmsFn = getGlobalSaveAlarms();
    const hasGlobalAlarms = !!(globalAlarms && saveAlarmsFn);
    if (hasGlobalAlarms && globalAlarms) {
        globalAlarms.push(globalAlarm);
    }

    // await saveData 确保持久化落盘
    try {
        await saveData();
        if (hasGlobalAlarms && saveAlarmsFn) {
            saveAlarmsFn();
        }
    } catch (e: any) {
        // 精确回滚内存状态
        const idx = entry.alarms.findIndex((a: any) => a.id === alarmId);
        if (idx >= 0) entry.alarms.splice(idx, 1);
        if (hasGlobalAlarms && globalAlarms) {
            const globalIdx = globalAlarms.findIndex((a: any) => a.id === alarmId);
            if (globalIdx >= 0) globalAlarms.splice(globalIdx, 1);
        }
        throw e;
    }
}

// removeAlarm 改为 async 并 await saveData，失败时基于快照与 ID 精确回滚
async function removeAlarm(iso: string, alarmId: string): Promise<void> {
    const entry = calData[iso];
    if (!entry || !entry.alarms) return;
    const idx = entry.alarms.findIndex((a: any) => a.id === alarmId);
    if (idx < 0) return;

    // 记录原始索引与被移除对象快照
    const removedEntryAlarm = entry.alarms[idx];
    const globalAlarms = getGlobalAlarms();
    const saveAlarmsFn = getGlobalSaveAlarms();
    const hasGlobalAlarms = !!(globalAlarms && saveAlarmsFn);
    let globalIdx = -1;
    let removedGlobalAlarm: any = null;

    if (hasGlobalAlarms && globalAlarms) {
        globalIdx = globalAlarms.findIndex((a: any) =>
            a.id === alarmId ||
            (a.date === iso && a.h === removedEntryAlarm.h && a.m === removedEntryAlarm.m && a.label === removedEntryAlarm.label)
        );
        if (globalIdx >= 0) {
            removedGlobalAlarm = globalAlarms[globalIdx];
        }
    }

    // 执行内存删除
    entry.alarms.splice(idx, 1);
    if (globalIdx >= 0 && globalAlarms) {
        globalAlarms.splice(globalIdx, 1);
    }

    try {
        await saveData();
        if (hasGlobalAlarms && saveAlarmsFn && globalIdx >= 0) {
            saveAlarmsFn();
        }
    } catch (e: any) {
        // 持久化失败：精确按原位置回滚还原
        entry.alarms.splice(idx, 0, removedEntryAlarm);
        if (hasGlobalAlarms && globalIdx >= 0 && removedGlobalAlarm && globalAlarms) {
            globalAlarms.splice(globalIdx, 0, removedGlobalAlarm);
        }
        throw e;
    }

    renderMonthView();
    if (selectedDate) renderDayDetail(selectedDate);
}

// 左下：保存闹钟
// await addAlarm 确保保存成功后再刷新 UI；失败提示用户
async function saveAlarm(): Promise<void> {
    if (!selectedDate) {
        alert('请先在日历中选择一个日期');
        return;
    }
    const timeVal = elAlarmTime.value;
    if (!timeVal) {
        alert('请选择闹钟时间');
        return;
    }
    const parts = timeVal.split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const label = elAlarmLabel.value.trim();
    try {
        await addAlarm(selectedDate, h, m, label);
    } catch (e: any) {
        alert('闹钟保存失败：' + (e && e.message || e));
        return;
    }
    elAlarmLabel.value = '';
    renderMonthView();
    selectDate(selectedDate);
}

/* ==================== 待办（便签）管理 ==================== */
// 右下：保存待办便签
async function saveTodo(): Promise<void> {
    if (!selectedDate) {
        alert('请先在日历中选择一个日期');
        return;
    }
    const text = elNoteText.value.trim();
    if (!text) {
        alert('请输入便签内容');
        return;
    }
    const globalNotes = getGlobalNotes();
    const saveNotesFn = getGlobalSaveNotesToDisk();
    if (!globalNotes || !saveNotesFn) {
        alert('便签系统未就绪');
        return;
    }
    const newNote = {
        id: genId(),
        content: text,
        todos: [],
        targetDate: selectedDate,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    globalNotes.push(newNote);
    try {
        await saveNotesFn();
        const renderListFn = getGlobalRenderNoteList();
        if (renderListFn) renderListFn();
    } catch (e: any) {
        console.error('保存便签失败:', e);
        alert('保存便签失败：' + e.message);
        return;
    }
    elNoteText.value = '';
    renderMonthView();
    selectDate(selectedDate);
}

// 删除便签
async function deleteNote(noteId: any): Promise<void> {
    const globalNotes = getGlobalNotes();
    if (!globalNotes) return;
    const idx = globalNotes.findIndex((n: any) => n.id === noteId);
    if (idx < 0) return;
    globalNotes.splice(idx, 1);
    try {
        const saveNotesFn = getGlobalSaveNotesToDisk();
        if (saveNotesFn) await saveNotesFn();
        const renderListFn = getGlobalRenderNoteList();
        if (renderListFn) renderListFn();
    } catch (e: any) {
        console.error('删除便签失败:', e);
    }
    renderMonthView();
    if (selectedDate) renderDayDetail(selectedDate);
}

/* ==================== 导航 ==================== */
function prevMonth(): void {
    viewMonth--;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    renderMonthView();
}

function nextMonth(): void {
    viewMonth++;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    renderMonthView();
}

function goToToday(): void {
    const now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
    renderMonthView();
    selectDate(toISODate(now));
}

/* ==================== 初始化 ==================== */
// 加 dataReady 门控，避免导航按钮在 loadData 完成前触发竞态
let dataReady = false;
export function initCalendar(): void {
    // 获取 DOM 引用
    elGrid = $('calGrid');
    elTitle = $('calTitle');
    elPrevBtn = $('calPrevBtn');
    elNextBtn = $('calNextBtn');
    elTodayBtn = $('calTodayBtn');
    // 热力图
    elHmContainer = $('hmContainer');
    elHmSummary = $('hmSummary');
    elHmScroll = $('hmScroll');
    // 下半部左：闹钟区
    elDetailDate = $('calDetailDate');
    elAlarmInputArea = $('calAlarmInputArea');
    elAlarmTime = $('calAlarmTime');
    elAlarmLabel = $('calAlarmLabel');
    elSaveAlarmBtn = $('calSaveAlarmBtn');
    elDayAlarmList = $('calDayAlarmList');
    // 下半部右：待办区
    elTodoTitle = $('calTodoTitle');
    elTodoInputArea = $('calTodoInputArea');
    elNoteText = $('calNoteText');
    elSaveTodoBtn = $('calSaveTodoBtn');
    elNoteList = $('calNoteList');

    // 关键 DOM 缺失时打 warn 并跳过绑定（防御性，避免后续 addEventListener 抛错中断 init）
    const missing: string[] = [];
    if (!elGrid) missing.push('calGrid');
    if (!elTitle) missing.push('calTitle');
    if (!elPrevBtn) missing.push('calPrevBtn');
    if (!elNextBtn) missing.push('calNextBtn');
    if (!elTodayBtn) missing.push('calTodayBtn');
    if (!elSaveAlarmBtn) missing.push('calSaveAlarmBtn');
    if (!elSaveTodoBtn) missing.push('calSaveTodoBtn');
    if (!elNoteText) missing.push('calNoteText');
    if (missing.length > 0) {
        console.warn('[calendar.init] 关键 DOM 元素缺失，跳过事件绑定:', missing.join(', '));
        return;
    }

    // 导航按钮（加 dataReady 门控，loadData 未完成前点击无效，避免竞态）
    elPrevBtn.addEventListener('click', () => { if (dataReady) prevMonth(); });
    elNextBtn.addEventListener('click', () => { if (dataReady) nextMonth(); });
    elTodayBtn.addEventListener('click', () => { if (dataReady) goToToday(); });

    // 左下：保存闹钟按钮
    elSaveAlarmBtn.addEventListener('click', saveAlarm);

    // 右下：保存待办按钮
    elSaveTodoBtn.addEventListener('click', saveTodo);

    // Ctrl+Enter 快捷保存待办
    elNoteText.addEventListener('keydown', (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            saveTodo();
        }
    });

    // 初始化视图为当前月
    const now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();

    // 加 .catch() 兜底，loadData 失败时打 warn 并设置 dataReady，避免按钮永久失效
    // 加载完成后置位 dataReady，让导航按钮生效
    loadData()
        .then(async () => {
            dataReady = true;
            renderMonthView();
            selectDate(toISODate(now));
            await loadActivityData();
            renderHeatmap();
            bindHeatmapResize();
        })
        .catch((e: any) => {
            console.error('[calendar.init] loadData 失败:', e);
            // 即使加载失败也允许导航（操作空数据），避免按钮永久失效
            dataReady = true;
            renderMonthView();
            selectDate(toISODate(now));
        });
}

// 当日历 tab 被激活时调用
export function onTabActivated(): void {
    if (elGrid) {
        renderMonthView();
        if (selectedDate) renderDayDetail(selectedDate);
    }
    // 切换到日历页时刷新热力图（便签/待办可能有更新）
    refreshHeatmap();
}

// 切换到其他 tab 时调用：清掉 resize 防抖计时器，避免离开后还触发一次重绘
export function onTabDeactivated(): void {
    if (hmResizeTimer) { clearTimeout(hmResizeTimer); hmResizeTimer = null; }
}
