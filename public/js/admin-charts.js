// public/js/admin-charts.js

// تابع کمکی برای گرفتن ابعاد با fallback
function getContainerDimensions(container) {
    if (!container) return { width: 600, height: 300 };
    
    let width = container.clientWidth;
    let height = container.clientHeight;
    
    // اگر ابعاد صفر بود، از مقادیر پیش‌فرض استفاده کن
    if (width === 0) width = 600;
    if (height === 0) height = 300;
    
    return { width, height };
}

// تابع نمایش پیام خالی
function drawEmptyState(container, message = 'داده‌ای برای نمایش وجود ندارد') {
    if (!container) return;
    
    container.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'flex items-center justify-center h-full min-h-[200px] bg-gray-50 rounded-lg';
    div.innerHTML = `
        <div class="text-center text-gray-400">
            <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
            </svg>
            <p class="text-sm">${message}</p>
        </div>
    `;
    container.appendChild(div);
}

// نمودار خطی (فروش ماهانه)
function drawSalesChart(data) {
    const container = document.getElementById('salesChart');
    if (!container) {
        console.error('salesChart container not found');
        return;
    }
    
    // اگر داده وجود نداشت یا خالی بود
    if (!data || !data.values || data.values.length === 0) {
        drawEmptyState(container, 'داده‌ای برای نمایش وجود ندارد');
        return;
    }
    
    // گرفتن ابعاد با fallback
    const { width, height } = getContainerDimensions(container);
    
    // اگر عرض یا ارتفاع صفر بود، صبر کن تا下次
    if (width < 100 || height < 100) {
        setTimeout(() => drawSalesChart(data), 100);
        return;
    }
    
    const padding = { top: 20, right: 30, bottom: 50, left: 50 };
    const chartWidth = Math.max(width - padding.left - padding.right, 100);
    const chartHeight = Math.max(height - padding.top - padding.bottom, 50);
    
    const labels = data.labels || [];
    const values = data.values || [];
    
    if (labels.length === 0 || values.length === 0) {
        drawEmptyState(container, 'داده‌ای برای نمایش وجود ندارد');
        return;
    }
    
    const maxValue = Math.max(...values, 1);
    const xStep = chartWidth / (labels.length - 1);
    
    // پاک کردن container
    container.innerHTML = '';
    
    // ساخت SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.background = 'white';
    svg.style.borderRadius = '8px';
    
    // تعریف گرادیان
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    gradient.setAttribute('id', 'area-gradient');
    gradient.setAttribute('x1', '0%');
    gradient.setAttribute('y1', '0%');
    gradient.setAttribute('x2', '0%');
    gradient.setAttribute('y2', '100%');
    
    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('style', 'stop-color:#3b82f6;stop-opacity:0.3');
    
    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('style', 'stop-color:#3b82f6;stop-opacity:0.05');
    
    gradient.appendChild(stop1);
    gradient.appendChild(stop2);
    defs.appendChild(gradient);
    svg.appendChild(defs);
    
    // رسم خطوط grid
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
        const y = padding.top + (chartHeight / gridLines) * i;
        if (isNaN(y)) continue;
        
        const value = maxValue - (maxValue / gridLines) * i;
        
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', padding.left);
        line.setAttribute('y1', y);
        line.setAttribute('x2', width - padding.right);
        line.setAttribute('y2', y);
        line.setAttribute('stroke', '#e5e7eb');
        line.setAttribute('stroke-width', '0.5');
        line.setAttribute('stroke-dasharray', '4');
        svg.appendChild(line);
        
        // مقادیر روی محور Y
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', padding.left - 8);
        text.setAttribute('y', y + 4);
        text.setAttribute('text-anchor', 'end');
        text.setAttribute('font-size', '11');
        text.setAttribute('fill', '#6b7280');
        text.textContent = Math.round(value);
        svg.appendChild(text);
    }
    
    // محورها
    const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    xAxis.setAttribute('x1', padding.left);
    xAxis.setAttribute('y1', height - padding.bottom);
    xAxis.setAttribute('x2', width - padding.right);
    xAxis.setAttribute('y2', height - padding.bottom);
    xAxis.setAttribute('stroke', '#9ca3af');
    xAxis.setAttribute('stroke-width', '1');
    svg.appendChild(xAxis);
    
    const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    yAxis.setAttribute('x1', padding.left);
    yAxis.setAttribute('y1', padding.top);
    yAxis.setAttribute('x2', padding.left);
    yAxis.setAttribute('y2', height - padding.bottom);
    yAxis.setAttribute('stroke', '#9ca3af');
    yAxis.setAttribute('stroke-width', '1');
    svg.appendChild(yAxis);
    
    // نقاط و خط
    let points = '';
    let areaPoints = `${padding.left},${height - padding.bottom} `;
    
    for (let index = 0; index < values.length; index++) {
        const x = padding.left + (index * xStep);
        const y = padding.top + chartHeight - (values[index] / maxValue) * chartHeight;
        
        if (isNaN(x) || isNaN(y)) continue;
        
        points += `${x},${y} `;
        areaPoints += `${x},${y} `;
        
        // نقطه
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', x);
        dot.setAttribute('cy', y);
        dot.setAttribute('r', '4');
        dot.setAttribute('fill', '#3b82f6');
        dot.setAttribute('stroke', 'white');
        dot.setAttribute('stroke-width', '2');
        svg.appendChild(dot);
        
        // برچسب محور X
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', x);
        label.setAttribute('y', height - padding.bottom + 20);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '11');
        label.setAttribute('fill', '#6b7280');
        label.textContent = labels[index] || '';
        svg.appendChild(label);
        
        // نمایش مقدار روی نقطه
        const valueLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        valueLabel.setAttribute('x', x);
        valueLabel.setAttribute('y', y - 8);
        valueLabel.setAttribute('text-anchor', 'middle');
        valueLabel.setAttribute('font-size', '10');
        valueLabel.setAttribute('fill', '#3b82f6');
        valueLabel.setAttribute('font-weight', '500');
        // فرمت کردن اعداد (هزارتومان)
        const formattedValue = values[index] >= 1000 ? (values[index] / 1000).toFixed(0) + 'k' : values[index];
        valueLabel.textContent = formattedValue;
        svg.appendChild(valueLabel);
    }
    
    if (values.length > 0) {
        const lastX = padding.left + ((values.length - 1) * xStep);
        areaPoints += `${lastX},${height - padding.bottom}`;
    }
    
    // خط
    if (points.trim()) {
        const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        polyline.setAttribute('points', points.trim());
        polyline.setAttribute('fill', 'none');
        polyline.setAttribute('stroke', '#3b82f6');
        polyline.setAttribute('stroke-width', '2');
        svg.appendChild(polyline);
    }
    
    // ناحیه زیر خط
    if (areaPoints.trim() && points.trim()) {
        const area = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        area.setAttribute('points', areaPoints);
        area.setAttribute('fill', 'url(#area-gradient)');
        svg.appendChild(area);
    }
    
    container.appendChild(svg);
}

// نمودار میله‌ای (بازدید ۷ روز)
function drawVisitsChart(data) {
    const container = document.getElementById('visitsChart');
    if (!container) {
        console.error('visitsChart container not found');
        return;
    }
    
    // اگر داده وجود نداشت یا خالی بود
    if (!data || data.length === 0) {
        drawEmptyState(container, 'داده‌ای برای نمایش وجود ندارد');
        return;
    }
    
    // گرفتن ابعاد با fallback
    const { width, height } = getContainerDimensions(container);
    
    // اگر عرض یا ارتفاع صفر بود، صبر کن تا下次
    if (width < 100 || height < 100) {
        setTimeout(() => drawVisitsChart(data), 100);
        return;
    }
    
    const padding = { top: 20, right: 30, bottom: 50, left: 50 };
    const chartWidth = Math.max(width - padding.left - padding.right, 100);
    const chartHeight = Math.max(height - padding.top - padding.bottom, 50);
    
    const maxCount = Math.max(...data.map(d => d.count), 1);
    const barWidth = (chartWidth / data.length) * 0.7;
    const barSpacing = (chartWidth / data.length) * 0.3;
    
    // پاک کردن container
    container.innerHTML = '';
    
    // ساخت SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.background = 'white';
    svg.style.borderRadius = '8px';
    
    // خطوط grid
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
        const y = padding.top + (chartHeight / gridLines) * i;
        if (isNaN(y)) continue;
        
        const value = Math.round(maxCount - (maxCount / gridLines) * i);
        
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', padding.left);
        line.setAttribute('y1', y);
        line.setAttribute('x2', width - padding.right);
        line.setAttribute('y2', y);
        line.setAttribute('stroke', '#e5e7eb');
        line.setAttribute('stroke-width', '0.5');
        line.setAttribute('stroke-dasharray', '4');
        svg.appendChild(line);
        
        // مقادیر روی محور Y
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', padding.left - 8);
        text.setAttribute('y', y + 4);
        text.setAttribute('text-anchor', 'end');
        text.setAttribute('font-size', '11');
        text.setAttribute('fill', '#6b7280');
        text.textContent = value;
        svg.appendChild(text);
    }
    
    // محورها
    const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    xAxis.setAttribute('x1', padding.left);
    xAxis.setAttribute('y1', height - padding.bottom);
    xAxis.setAttribute('x2', width - padding.right);
    xAxis.setAttribute('y2', height - padding.bottom);
    xAxis.setAttribute('stroke', '#9ca3af');
    xAxis.setAttribute('stroke-width', '1');
    svg.appendChild(xAxis);
    
    const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    yAxis.setAttribute('x1', padding.left);
    yAxis.setAttribute('y1', padding.top);
    yAxis.setAttribute('x2', padding.left);
    yAxis.setAttribute('y2', height - padding.bottom);
    yAxis.setAttribute('stroke', '#9ca3af');
    yAxis.setAttribute('stroke-width', '1');
    svg.appendChild(yAxis);
    
    // رسم میله‌ها
    for (let index = 0; index < data.length; index++) {
        const item = data[index];
        const x = padding.left + (index * (barWidth + barSpacing)) + barSpacing / 2;
        const barHeight = (item.count / maxCount) * chartHeight;
        const y = height - padding.bottom - barHeight;
        
        if (isNaN(x) || isNaN(y) || isNaN(barHeight)) continue;
        
        // میله
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', barWidth);
        rect.setAttribute('height', Math.max(barHeight, 2));
        rect.setAttribute('fill', '#3b82f6');
        rect.setAttribute('rx', '4');
        rect.setAttribute('class', 'chart-bar');
        svg.appendChild(rect);
        
        // مقدار روی میله
        const valueLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        valueLabel.setAttribute('x', x + barWidth / 2);
        valueLabel.setAttribute('y', Math.max(y - 5, 15));
        valueLabel.setAttribute('text-anchor', 'middle');
        valueLabel.setAttribute('font-size', '10');
        valueLabel.setAttribute('fill', '#3b82f6');
        valueLabel.setAttribute('font-weight', '500');
        valueLabel.textContent = item.count;
        svg.appendChild(valueLabel);
        
        // برچسب محور X
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', x + barWidth / 2);
        label.setAttribute('y', height - padding.bottom + 20);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '10');
        label.setAttribute('fill', '#6b7280');
        // نمایش فقط روز (حذف سال و ماه)
        const day = item.date ? item.date.split('-')[2] : '';
        label.textContent = day || `${index + 1}`;
        svg.appendChild(label);
    }
    
    container.appendChild(svg);
}

// تابع کمکی برای به‌روزرسانی نمودارها با داده‌های واقعی
function updateCharts(salesData, visitsData) {
    if (salesData && salesData.values && salesData.values.length > 0) {
        drawSalesChart(salesData);
    } else {
        drawSalesChart({ labels: [], values: [] });
    }
    
    if (visitsData && visitsData.length > 0) {
        drawVisitsChart(visitsData);
    } else {
        drawVisitsChart([]);
    }
}

// تبدیل داده‌های EJS به فرمت مناسب برای نمودار
function prepareSalesData(monthlyData) {
  
  const months = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 
                  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  
  // اگر داده نداریم، داده تست بساز
  if (!monthlyData || monthlyData.length === 0) {
    return {
      labels: ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور'],
      values: [450000, 620000, 780000, 550000, 890000, 940000]
    };
  }
  
  const labels = [];
  const values = [];
  
  // گرفتن 6 ماه اخیر
  const last6Months = monthlyData.slice(-6);
  
  for (const item of last6Months) {
    if (item.month) {
      // استخراج شماره ماه
      const match = item.month.match(/-(\d+)/);
      if (match) {
        const monthNum = parseInt(match[1]);
        if (monthNum >= 1 && monthNum <= 12) {
          labels.push(months[monthNum - 1]);
          // استفاده از totalSales به جای orderCount
          const salesValue = item.totalSales || item.orderCount * 50000; // fallback
          values.push(Math.round(salesValue / 1000)); // تبدیل به هزار تومان برای نمایش بهتر
          continue;
        }
      }
      labels.push(item.month);
      values.push(item.totalSales || 0);
    }
  }
  
  // اگر باز هم داده نداشتیم
  if (labels.length === 0) {
    return {
      labels: ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور'],
      values: [450, 620, 780, 550, 890, 940]
    };
  }
  
  // اگر کمتر از 6 ماه داریم، بقیه رو با صفر پر کن
  while (labels.length < 6) {
    const currentMonthIndex = (labels.length + new Date().getMonth()) % 12;
    labels.unshift(months[currentMonthIndex]);
    values.unshift(0);
  }
  
  return { labels, values };
}


function prepareVisitsData(last7Days) {
    if (!last7Days || last7Days.length === 0) {
        // داده‌های نمونه برای نمایش
        return [
            { date: '۱۴۰۳-۰۱-۰۱', count: 45 },
            { date: '۱۴۰۳-۰۱-۰۲', count: 62 },
            { date: '۱۴۰۳-۰۱-۰۳', count: 78 },
            { date: '۱۴۰۳-۰۱-۰۴', count: 55 },
            { date: '۱۴۰۳-۰۱-۰۵', count: 89 },
            { date: '۱۴۰۳-۰۱-۰۶', count: 94 },
            { date: '۱۴۰۳-۰۱-۰۷', count: 71 }
        ];
    }
    return last7Days;
}

function testSalesChart() {
    const testData = {
        labels: ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور'],
        values: [45, 62, 78, 55, 89, 94]
    };
    drawSalesChart(testData);
}

function testVisitsChart() {
    const testData = [
        { date: '۱۴۰۳-۰۱-۰۱', count: 45 },
        { date: '۱۴۰۳-۰۱-۰۲', count: 62 },
        { date: '۱۴۰۳-۰۱-۰۳', count: 78 },
        { date: '۱۴۰۳-۰۱-۰۴', count: 55 },
        { date: '۱۴۰۳-۰۱-۰۵', count: 89 },
        { date: '۱۴۰۳-۰۱-۰۶', count: 94 },
        { date: '۱۴۰۳-۰۱-۰۷', count: 71 }
    ];
    drawVisitsChart(testData);
}
