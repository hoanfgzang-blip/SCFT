function createHistoryRow(item) {
    return `
        <tr>
            <td>${item.deviceName}</td>
            <td>${calculateTimeAgo(item.lastConnectedAt)}</td>
            <td>${item.status}</td>
        </tr>
    `;
}
function calculateTimeAgo(timestamp) {
    const now = new Date();
    const past = new Date(timestamp);
    const diffInMs = now - past;
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    if (diffInMinutes < 60) {
        return `${diffInMinutes}m`;      
    } else if (diffInHours < 24) {
        return `${diffInHours}h`;      
    } else {
        return `${diffInDays}d`;
    }
}
async function initHistoryTable() {
    try {
        const response = await fetch('./mockData/history.json');
        const historyData = await response.json();
        const tbody = document.getElementById("history_tbody");
        if (!tbody) return; 
        let htmlContent = "";
        historyData.forEach(item => {
            htmlContent += createHistoryRow(item);
        });
        tbody.innerHTML = htmlContent;
    } catch (error) {
        console.error("Lỗi: ", error);
    }
}

initHistoryTable();