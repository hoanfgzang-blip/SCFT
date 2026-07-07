import React, { useMemo, useRef, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

const currentPhone = {
  id: "phone-ipcuak",
  name: "iPcuak",
  code: "A1B2C3"
};

const initialComputers = [
  {
    id: "A1B2C3D4",
    name: "My Laptop",
    type: "laptop",
    pairedPhoneId: currentPhone.id,
    status: "online",
    connection: "connected",
    lastSeen: "8 hours ago"
  },
  {
    id: "D7E8F9A0",
    name: "Studio PC",
    type: "desktop",
    pairedPhoneId: currentPhone.id,
    status: "online",
    connection: "disabled",
    lastSeen: "Yesterday"
  },
  {
    id: "Z9Y8X7W6",
    name: "Office Laptop",
    type: "laptop",
    pairedPhoneId: "another-phone",
    status: "online",
    connection: "connected",
    lastSeen: "2 days ago"
  }
];

const initialTransfers = [
  {
    id: "tr-1",
    deviceId: "A1B2C3D4",
    fileName: "Project_Report.pdf",
    direction: "received",
    size: "4.2 MB",
    time: "10:24 AM",
    status: "Done"
  },
  {
    id: "tr-2",
    deviceId: "A1B2C3D4",
    fileName: "screen_recording.mp4",
    direction: "sent",
    size: "26.8 MB",
    time: "09:41 AM",
    status: "Done"
  },
  {
    id: "tr-3",
    deviceId: "D7E8F9A0",
    fileName: "design_assets.zip",
    direction: "received",
    size: "12.5 MB",
    time: "Yesterday",
    status: "Paused"
  }
];

const light = {
  bg: "#fbfbfd",
  card: "#ffffff",
  panel: "#f8f9fb",
  text: "#1d2028",
  subtle: "#8e96a5",
  faint: "#aab2bf",
  line: "#e7eaf0",
  hardLine: "#16191f",
  blue: "#1478f8",
  blueSoft: "#d7e9ff",
  green: "#09cf6a",
  amber: "#ffad31",
  red: "#ff5a66",
  nav: "#ffffff",
  shadow: "#142034"
};

const dark = {
  bg: "#0f1218",
  card: "#171c25",
  panel: "#202633",
  text: "#f5f7fb",
  subtle: "#9aa4b2",
  faint: "#7f8b9b",
  line: "#2b3341",
  hardLine: "#3b4658",
  blue: "#49a0ff",
  blueSoft: "#173963",
  green: "#20df7a",
  amber: "#ffc25f",
  red: "#ff7580",
  nav: "#121821",
  shadow: "#000000"
};

function Header({ colors }) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={[styles.logo, { color: colors.text }]}>SCFT</Text>
        <Text style={[styles.subtitle, { color: colors.subtle }]}>Screen Copy &amp; File Transfer</Text>
      </View>
      <Pressable style={[styles.profileButton, { borderColor: colors.line, backgroundColor: colors.bg }]}>
        <ProfileIcon color={colors.faint} />
      </Pressable>
    </View>
  );
}

function HomeScreen({ colors, phone, computers, onToggleComputer, onAddComputer }) {
  const pairedComputers = computers.filter((device) => device.pairedPhoneId === phone.id);
  const connectedComputers = pairedComputers.filter((device) => device.connection === "connected");
  const heroDevice = connectedComputers[0] || pairedComputers[0];

  return (
    <View style={styles.screen}>
      <Header colors={colors} />

      <View style={styles.connectingBlock}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Connecting Device</Text>
        {heroDevice ? (
          <ConnectedComputerCard colors={colors} device={heroDevice} onPress={() => onToggleComputer(heroDevice.id)} />
        ) : (
          <View style={[styles.emptyConnectCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <LaptopIcon color={colors.faint} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No paired computer</Text>
          </View>
        )}

        <Pressable style={[styles.addButton, { backgroundColor: colors.blueSoft }]} onPress={onAddComputer}>
          <Text style={[styles.addButtonText, { color: colors.blue }]}>+ Add Device</Text>
        </Pressable>
      </View>

      <View style={styles.recentBlock}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Devices</Text>
        {pairedComputers.map((device) => (
          <RecentDevice key={device.id} colors={colors} device={device} onPress={() => onToggleComputer(device.id)} />
        ))}
      </View>
    </View>
  );
}

function ConnectedComputerCard({ colors, device, onPress }) {
  const connected = device.connection === "connected";

  return (
    <Pressable style={[styles.connectCard, { backgroundColor: colors.card, borderColor: colors.line }]} onPress={onPress}>
      <LaptopIcon color={colors.text} large />
      <View style={styles.connectCopy}>
        <Text style={[styles.deviceName, { color: colors.text }]} numberOfLines={1}>
          {device.name}
        </Text>
        <View style={styles.onlineRow}>
          <View style={[styles.onlineDot, { backgroundColor: connected ? colors.green : colors.amber }]} />
          <Text style={[styles.onlineText, { color: connected ? colors.green : colors.amber }]}>
            {connected ? "Online" : "Disabled"}
          </Text>
        </View>
        <Text style={[styles.idText, { color: colors.subtle }]}>ID: {device.id}</Text>
      </View>
      <WifiIcon dimmed={!connected} />
      <View style={styles.dots}>
        <View style={[styles.dot, { backgroundColor: colors.text }]} />
        <View style={[styles.dot, { backgroundColor: colors.text }]} />
        <View style={[styles.dot, { backgroundColor: colors.text }]} />
      </View>
    </Pressable>
  );
}

function RecentDevice({ colors, device, onPress }) {
  const connected = device.connection === "connected";
  const statusColor = connected ? colors.green : colors.amber;

  return (
    <Pressable style={[styles.recentCard, { backgroundColor: colors.card, borderColor: colors.hardLine }]} onPress={onPress}>
      {device.type === "desktop" ? <MonitorIcon color={colors.text} /> : <LaptopIcon color={colors.text} />}
      <View style={styles.recentCopy}>
        <Text style={[styles.recentTitle, { color: colors.text }]} numberOfLines={1}>
          {device.name}
        </Text>
        <Text style={[styles.recentTime, { color: colors.subtle }]} numberOfLines={1}>
          {connected ? "Connected" : device.lastSeen}
        </Text>
      </View>
      <View style={[styles.statusPill, { backgroundColor: connected ? colors.blueSoft : colors.panel }]}>
        <Text style={[styles.statusPillText, { color: connected ? colors.blue : statusColor }]}>
          {connected ? "Disable" : "Connect"}
        </Text>
      </View>
      <ChevronIcon color={colors.text} />
    </Pressable>
  );
}

function FileTransferScreen({
  colors,
  connectedComputers,
  selectedComputerId,
  setSelectedComputerId,
  transferHistory,
  onCreateTransfer
}) {
  const selectedDevice = connectedComputers.find((device) => device.id === selectedComputerId) || connectedComputers[0];
  const connectedIds = connectedComputers.map((device) => device.id);
  const visibleTransfers = transferHistory.filter((item) => connectedIds.includes(item.deviceId));

  return (
    <ScrollView style={styles.transferScroll} contentContainerStyle={styles.transferContent} showsVerticalScrollIndicator={false}>
      <Header colors={colors} />

      {selectedDevice ? (
        <>
          <View style={[styles.settingCard, { backgroundColor: colors.card, borderColor: colors.line, shadowColor: colors.shadow }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>File Transfer</Text>
            <View style={styles.fieldWrap}>
              <Text style={[styles.label, { color: colors.faint }]}>Connected Computer</Text>
              <SelectMenu
                colors={colors}
                value={selectedDevice.name}
                options={connectedComputers.map((device) => device.name)}
                onChange={(name) => {
                  const nextDevice = connectedComputers.find((device) => device.name === name);
                  if (nextDevice) {
                    setSelectedComputerId(nextDevice.id);
                  }
                }}
                icon={<MonitorIcon color={colors.subtle} small />}
              />
            </View>
            <View style={styles.identityGrid}>
              <SmallField colors={colors} label="ID" value={selectedDevice.id} />
              <SmallField colors={colors} label="Status" value="Online" online />
            </View>
          </View>

          <View style={[styles.transferActionCard, { backgroundColor: colors.card, borderColor: colors.line, shadowColor: colors.shadow }]}>
            <Pressable
              style={[styles.transferAction, { backgroundColor: colors.blue }]}
              onPress={() => onCreateTransfer("sent", selectedDevice.id)}
            >
              <SendIcon color="#ffffff" />
              <Text style={styles.transferActionText}>Send File</Text>
            </Pressable>
            <Pressable
              style={[styles.transferAction, { backgroundColor: colors.blueSoft }]}
              onPress={() => onCreateTransfer("received", selectedDevice.id)}
            >
              <ReceiveIcon color={colors.blue} />
              <Text style={[styles.transferActionText, { color: colors.blue }]}>Receive</Text>
            </Pressable>
          </View>

          <View style={[styles.settingCard, { backgroundColor: colors.card, borderColor: colors.line, shadowColor: colors.shadow }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Transfer History</Text>
            <View style={styles.historyList}>
              {visibleTransfers.length ? (
                visibleTransfers.map((item) => (
                  <TransferHistoryItem key={item.id} colors={colors} item={item} device={connectedComputers.find((device) => device.id === item.deviceId)} />
                ))
              ) : (
                <Text style={[styles.emptyCopy, { color: colors.subtle }]}>No file transfers yet</Text>
              )}
            </View>
          </View>
        </>
      ) : (
        <View style={[styles.emptyStateCard, { backgroundColor: colors.card, borderColor: colors.line, shadowColor: colors.shadow }]}>
          <View style={[styles.emptyIconWrap, { backgroundColor: colors.panel }]}>
            <MonitorIcon color={colors.faint} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No computer connected</Text>
          <Text style={[styles.emptyCopy, { color: colors.subtle }]}>Connect a computer from Home to show transfer history</Text>
        </View>
      )}
    </ScrollView>
  );
}

function TransferHistoryItem({ colors, item, device }) {
  const sent = item.direction === "sent";

  return (
    <View style={[styles.historyItem, { backgroundColor: colors.panel, borderColor: colors.line }]}>
      <View style={[styles.historyIcon, { backgroundColor: sent ? colors.blueSoft : colors.card }]}>
        {sent ? <SendIcon color={colors.blue} small /> : <ReceiveIcon color={colors.blue} small />}
      </View>
      <View style={styles.historyCopy}>
        <Text style={[styles.historyTitle, { color: colors.text }]} numberOfLines={1}>
          {item.fileName}
        </Text>
        <Text style={[styles.historyMeta, { color: colors.subtle }]} numberOfLines={1}>
          {sent ? "Sent to" : "Received from"} {device?.name || "Computer"} · {item.size}
        </Text>
      </View>
      <View style={styles.historyRight}>
        <Text style={[styles.historyStatus, { color: item.status === "Done" ? colors.green : colors.amber }]}>{item.status}</Text>
        <Text style={[styles.historyTime, { color: colors.faint }]}>{item.time}</Text>
      </View>
    </View>
  );
}

function SettingsScreen({ colors, theme, setTheme, settings, setSettings, device, onRenameDevice }) {
  const { audioRoute, volume, lastVolume, fps, resolution, bitrate } = settings;
  const inputRef = useRef(null);
  const statusValue = device?.connection === "connected" ? "Online" : "Disabled";

  const updateVolume = (nextVolume) => {
    setSettings((current) => ({
      ...current,
      volume: nextVolume,
      lastVolume: nextVolume > 0 ? nextVolume : current.lastVolume
    }));
  };

  const toggleMute = () => {
    if (volume > 0) {
      setSettings((current) => ({ ...current, lastVolume: current.volume, volume: 0 }));
      return;
    }

    setSettings((current) => ({ ...current, volume: lastVolume || 0.5 }));
  };

  const updateBitrate = (progress) => {
    const nextBitrate = 2.5 + progress * 22.5;
    setSettings((current) => ({ ...current, bitrate: Math.round(nextBitrate * 2) / 2 }));
  };

  return (
    <ScrollView style={styles.transferScroll} contentContainerStyle={styles.transferContent} showsVerticalScrollIndicator={false}>
      <Header colors={colors} />

      <View style={[styles.settingCard, { backgroundColor: colors.card, borderColor: colors.line, shadowColor: colors.shadow }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Device Identify</Text>
        <View style={styles.fieldWrap}>
          <Text style={[styles.label, { color: colors.faint }]}>Device Name</Text>
          <View style={[styles.bigField, { backgroundColor: colors.panel, borderColor: colors.line }]}>
            <TextInput
              ref={inputRef}
              value={device?.name || ""}
              editable={Boolean(device)}
              onChangeText={(text) => device && onRenameDevice(device.id, text)}
              placeholder="Device name"
              placeholderTextColor={colors.faint}
              selectionColor={colors.blue}
              style={[styles.fieldInput, { color: colors.text }]}
            />
            <Pressable hitSlop={10} onPress={() => inputRef.current?.focus()}>
              <EditIcon color={colors.faint} />
            </Pressable>
          </View>
        </View>
        <View style={styles.identityGrid}>
          <SmallField colors={colors} label="ID" value={device?.id || "N/A"} />
          <SmallField colors={colors} label="Status" value={statusValue} online={statusValue === "Online"} />
        </View>
      </View>

      <View style={[styles.settingCard, { backgroundColor: colors.card, borderColor: colors.line, shadowColor: colors.shadow }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Audio</Text>
        <View style={styles.fieldWrap}>
          <Text style={[styles.label, { color: colors.faint }]}>Output Routing</Text>
          <SelectMenu
            colors={colors}
            value={audioRoute}
            options={["This device", "Connected phone", "Bluetooth audio"]}
            onChange={(option) => setSettings((current) => ({ ...current, audioRoute: option }))}
            icon={<MonitorIcon color={colors.subtle} small />}
          />
        </View>
        <View style={styles.rangeBlock}>
          <Text style={[styles.label, { color: colors.faint }]}>Volume</Text>
          <View style={styles.rangeRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={volume === 0 ? "Unmute audio" : "Mute audio"}
              hitSlop={10}
              onPress={toggleMute}
            >
              <VolumeIcon color={volume === 0 ? colors.faint : colors.subtle} muted={volume === 0} />
            </Pressable>
            <InteractiveSlider colors={colors} value={volume} onChange={updateVolume} accessibilityLabel="Volume" />
            <Text style={[styles.rangeValue, styles.volumeValue, { color: colors.faint }]}>{Math.round(volume * 100)}%</Text>
          </View>
        </View>
      </View>

      <View style={[styles.settingCard, { backgroundColor: colors.card, borderColor: colors.line, shadowColor: colors.shadow }]}>
        <View style={styles.sectionHeader}><SpeedIcon color={colors.blue} /><Text style={[styles.sectionTitle,{color:colors.text,marginLeft:8}]}>Stream Performance</Text></View>
        <View style={styles.performanceGrid}>
          <View style={styles.performanceLeft}>
            <Text style={[styles.label, { color: colors.faint }]}>fps</Text>
            <View style={[styles.segmentBox, { backgroundColor: colors.panel }]}>
              {["30", "60", "120"].map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected: fps === option }}
                  onPress={() => setSettings((current) => ({ ...current, fps: option }))}
                  style={[styles.segmentItem, fps === option && { backgroundColor: colors.blueSoft }]}
                >
                  <Text style={[styles.segmentText, { color: fps === option ? colors.blue : colors.subtle }]}>{option}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.performanceRight}>
            <Text style={[styles.label, { color: colors.faint }]}>Display Resolution</Text>
            <SelectMenu
              colors={colors}
              value={resolution}
              options={["720p", "1080p", "1440p", "4K"]}
              onChange={(option) => setSettings((current) => ({ ...current, resolution: option }))}
              compact
            />
          </View>
        </View>
        <View style={styles.bitrateBlock}>
          <View style={styles.bitrateLabelRow}>
            <Text style={[styles.label, { color: colors.faint }]}>Bitrate Allocation</Text>
            <Text style={[styles.rangeValue, { color: colors.faint }]}>{bitrate.toFixed(1)} mbps</Text>
          </View>
          <InteractiveSlider
            colors={colors}
            value={(bitrate - 2.5) / 22.5}
            onChange={updateBitrate}
            accessibilityLabel="Bitrate allocation"
          />
        </View>
      </View>

      <View style={[styles.themeCard, { backgroundColor: colors.card, borderColor: colors.line, shadowColor: colors.shadow }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Theme</Text>
        <View style={[styles.themeToggle, { backgroundColor: colors.bg, borderColor: colors.line }]}>
          <ThemeOption colors={colors} active={theme === "light"} label="Light" icon="sun" onPress={() => setTheme("light")} />
          <ThemeOption colors={colors} active={theme === "dark"} label="Dark" icon="moon" onPress={() => setTheme("dark")} />
        </View>
      </View>
    </ScrollView>
  );
}

function SmallField({ colors, label, value, online }) {
  return (
    <View style={[styles.smallField, { backgroundColor: colors.panel, borderColor: colors.line }]}>
      <Text style={[styles.label, { color: colors.faint }]}>{label}</Text>
      <Text style={[styles.smallFieldValue, { color: online ? colors.green : colors.text }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function SelectMenu({ colors, value, options, onChange, icon, compact }) {
  const [open, setOpen] = useState(false);

  const chooseOption = (option) => {
    onChange(option);
    setOpen(false);
  };

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Selected ${value}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={[
          compact ? styles.resolutionField : styles.selectField,
          { backgroundColor: colors.bg, borderColor: open ? colors.blue : colors.line }
        ]}
      >
        {icon}
        <Text style={[styles.selectText, { color: colors.text }]} numberOfLines={1}>
          {value}
        </Text>
        <View style={open && styles.chevronOpen}>
          <DownIcon color={open ? colors.blue : colors.faint} />
        </View>
      </Pressable>

      {open && (
        <View style={[styles.optionMenu, { backgroundColor: colors.card, borderColor: colors.line }]}>
          {options.map((option) => {
            const selected = option === value;
            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => chooseOption(option)}
                style={[styles.optionRow, selected && { backgroundColor: colors.blueSoft }]}
              >
                <Text style={[styles.optionText, { color: selected ? colors.blue : colors.text }]} numberOfLines={1}>
                  {option}
                </Text>
                {selected && <View style={[styles.optionDot, { backgroundColor: colors.blue }]} />}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function InteractiveSlider({ colors, value, onChange, accessibilityLabel }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const normalizedValue = Math.max(0, Math.min(1, value));

  const updateFromTouch = (event) => {
    if (!trackWidth) {
      return;
    }

    const progress = Math.max(0, Math.min(1, event.nativeEvent.locationX / trackWidth));
    onChange(progress);
  };

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(normalizedValue * 100) }}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onStartShouldSetResponderCapture={() => true}
      onMoveShouldSetResponderCapture={() => true}
      onResponderGrant={updateFromTouch}
      onResponderMove={updateFromTouch}
      onResponderTerminationRequest={() => false}
      style={styles.sliderTouchArea}
    >
      <View style={[styles.sliderTrack, { backgroundColor: colors.panel }]}>
        <View style={[styles.sliderFill, { width: `${normalizedValue * 100}%`, backgroundColor: colors.blueSoft }]} />
        <View style={[styles.sliderThumb,{left:`${normalizedValue*100}%`,backgroundColor:colors.blue,borderColor:"#fff",borderWidth:3}]}><View style={styles.sliderThumbInner}/></View>
      </View>
    </View>
  );
}

function ThemeOption({ colors, active, label, icon, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.themeOption, active && { backgroundColor: colors.blueSoft }]}>
      {icon === "sun" ? <SunIcon color={active ? colors.blue : colors.faint} /> : <MoonIcon color={active ? colors.blue : colors.faint} />}
      <Text style={[styles.themeText, { color: active ? colors.blue : colors.subtle }]}>
        {label}
        {"\n"}Mode
      </Text>
      <View style={[styles.themeRadio, { borderColor: active ? colors.blue : colors.line, backgroundColor: colors.card }]}>
        {active && <View style={[styles.themeRadioDot, { backgroundColor: colors.blue }]} />}
      </View>
    </Pressable>
  );
}

function BottomNav({ colors, activeScreen, setActiveScreen }) {
  return (
    <View style={[styles.bottomNav, { backgroundColor: colors.nav, borderTopColor: colors.line }]}>
      <NavItem colors={colors} active={activeScreen === "home"} label="Home" onPress={() => setActiveScreen("home")}>
        <HomeIcon color={activeScreen === "home" ? colors.blue : colors.faint} />
      </NavItem>
      <NavItem colors={colors} label="Screen Copy">
        <MonitorIcon color={colors.faint} />
      </NavItem>
      <NavItem colors={colors} active={activeScreen === "transfer"} label="File Transfer" onPress={() => setActiveScreen("transfer")}>
        <View style={[styles.fileIconWrap, activeScreen === "transfer" && { backgroundColor: colors.blue }]}>
          <FolderIcon color={activeScreen === "transfer" ? "#ffffff" : colors.faint} />
        </View>
      </NavItem>
      <NavItem colors={colors} active={activeScreen === "setting"} label="Setting" onPress={() => setActiveScreen("setting")}>
        <GearIcon color={activeScreen === "setting" ? colors.blue : colors.faint} />
      </NavItem>
    </View>
  );
}

function NavItem({ colors, active, label, onPress, children }) {
  return (
    <Pressable style={styles.navItem} onPress={onPress}>
      {children}
      <Text style={[styles.navText, { color: active ? colors.blue : colors.faint }]}>{label}</Text>
    </Pressable>
  );
}

export default function App() {
  const [activeScreen, setActiveScreen] = useState("home");
  const [theme, setTheme] = useState("light");
  const [computers, setComputers] = useState(initialComputers);
  const [selectedComputerId, setSelectedComputerId] = useState("A1B2C3D4");
  const [transferHistory, setTransferHistory] = useState(initialTransfers);
  const [settings, setSettings] = useState({
    audioRoute: "This device",
    volume: 0.86,
    lastVolume: 0.86,
    fps: "60",
    resolution: "1080p",
    bitrate: 12.5
  });

  const colors = theme === "dark" ? dark : light;
  const generated = useMemo(() => makeStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const pairedComputers = computers.filter((device) => device.pairedPhoneId === currentPhone.id);
  const connectedComputers = pairedComputers.filter((device) => device.connection === "connected");
  const settingsDevice = connectedComputers[0] || pairedComputers[0];

  Object.assign(styles, generated);

  const toggleComputerConnection = (id) => {
    setComputers((current) =>
      current.map((device) =>
        device.id === id
          ? {
              ...device,
              status: "online",
              connection: device.connection === "connected" ? "disabled" : "connected",
              lastSeen: device.connection === "connected" ? "Just now" : device.lastSeen
            }
          : device
      )
    );
  };

  const renameComputer = (id, name) => {
    setComputers((current) => current.map((device) => (device.id === id ? { ...device, name } : device)));
  };

  const addComputer = () => {
    const number = computers.filter((device) => device.pairedPhoneId === currentPhone.id).length + 1;
    const newDevice = {
      id: `PC${Date.now().toString().slice(-6)}`,
      name: `Desktop ${number}`,
      type: "desktop",
      pairedPhoneId: currentPhone.id,
      status: "online",
      connection: "connected",
      lastSeen: "Just now"
    };

    setComputers((current) => [...current, newDevice]);
    setSelectedComputerId(newDevice.id);
  };

  const createMockTransfer = (direction, deviceId) => {
    const nextFile = direction === "sent" ? "mobile_upload.zip" : "desktop_export.png";
    const nextTransfer = {
      id: `tr-${Date.now()}`,
      deviceId,
      fileName: nextFile,
      direction,
      size: direction === "sent" ? "8.4 MB" : "2.1 MB",
      time: "Just now",
      status: "Done"
    };

    setTransferHistory((current) => [nextTransfer, ...current]);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={theme === "dark" ? "light-content" : "dark-content"} />
      <View style={[styles.appFrame, { width: Math.min(width, 390), backgroundColor: colors.bg }]}>
        {activeScreen === "home" && (
          <HomeScreen
            colors={colors}
            phone={currentPhone}
            computers={computers}
            onToggleComputer={toggleComputerConnection}
            onAddComputer={addComputer}
          />
        )}
        {activeScreen === "transfer" && (
          <FileTransferScreen
            colors={colors}
            connectedComputers={connectedComputers}
            selectedComputerId={selectedComputerId}
            setSelectedComputerId={setSelectedComputerId}
            transferHistory={transferHistory}
            onCreateTransfer={createMockTransfer}
          />
        )}
        {activeScreen === "setting" && (
          <SettingsScreen
            colors={colors}
            theme={theme}
            setTheme={setTheme}
            settings={settings}
            setSettings={setSettings}
            device={settingsDevice}
            onRenameDevice={renameComputer}
          />
        )}
        <BottomNav colors={colors} activeScreen={activeScreen} setActiveScreen={setActiveScreen} />
      </View>
    </SafeAreaView>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      alignItems: "center"
    },
    appFrame: {
      flex: 1,
      overflow: "hidden"
    },
    screen: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 46,
      paddingBottom: 112
    },
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between"
    },
    logo: {
      fontSize: 38,
      lineHeight: 40,
      fontWeight: "900",
      letterSpacing: 0
    },
    subtitle: {
      marginTop: 6,
      fontSize: 13,
      lineHeight: 16
    },
    profileButton: {
      width: 40,
      height: 40,
      marginTop: -2,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderRadius: 20
    },
    connectingBlock: {
      marginTop: 48
    },
    sectionTitle: {
      fontSize: 17,
      lineHeight: 19,
      fontWeight: "900",
      letterSpacing: 0
    },
    connectCard: {
      height: 122,
      marginTop: 16,
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1.5,
      borderRadius: 17
    },
    emptyConnectCard: {
      height: 122,
      marginTop: 16,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderRadius: 17
    },
    connectCopy: {
      flex: 1,
      marginLeft: 12
    },
    deviceName: {
      fontSize: 16,
      lineHeight: 18,
      fontWeight: "900"
    },
    onlineRow: {
      marginTop: 3,
      flexDirection: "row",
      alignItems: "center",
      gap: 6
    },
    onlineDot: {
      width: 10,
      height: 10,
      borderRadius: 5
    },
    onlineText: {
      fontSize: 13,
      lineHeight: 15,
      fontWeight: "900"
    },
    idText: {
      marginTop: 7,
      fontSize: 13,
      lineHeight: 15
    },
    dots: {
      width: 18,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      gap: 6
    },
    dot: {
      width: 5,
      height: 5,
      borderRadius: 2.5
    },
    addButton: {
      height: 55,
      marginTop: 26,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 11
    },
    addButtonText: {
      fontSize: 16,
      lineHeight: 18,
      fontWeight: "900"
    },
    recentBlock: {
      marginTop: 56
    },
    recentCard: {
      height: 73,
      marginTop: 16,
      paddingLeft: 18,
      paddingRight: 12,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1.5,
      borderRadius: 11
    },
    recentCopy: {
      flex: 1,
      marginLeft: 12
    },
    recentTitle: {
      fontSize: 16,
      lineHeight: 18,
      fontWeight: "900"
    },
    recentTime: {
      marginTop: 6,
      fontSize: 13,
      lineHeight: 15,
      fontWeight: "700"
    },
    statusPill: {
      minWidth: 58,
      height: 24,
      marginRight: 5,
      paddingHorizontal: 8,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12
    },
    statusPillText: {
      fontSize: 10,
      lineHeight: 12,
      fontWeight: "900"
    },
    transferScroll: {
      flex: 1
    },
    transferContent: {
      paddingHorizontal: 20,
      paddingTop: 44,
      paddingBottom: 112
    },
    settingCard: {
      marginTop: 14,
      paddingHorizontal: 20,
      paddingVertical: 18,
      borderWidth: 1,
      borderRadius: 18,
      shadowOpacity: 0.06,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2
    },
    transferActionCard: {
      marginTop: 14,
      padding: 12,
      flexDirection: "row",
      gap: 12,
      borderWidth: 1,
      borderRadius: 18,
      shadowOpacity: 0.06,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2
    },
    transferAction: {
      flex: 1,
      height: 50,
      paddingHorizontal: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 12
    },
    transferActionText: {
      color: "#ffffff",
      fontSize: 13,
      lineHeight: 16,
      fontWeight: "900"
    },
    fieldWrap: {
      marginTop: 18
    },
    label: {
      fontSize: 11,
      lineHeight: 13,
      fontWeight: "500"
    },
    bigField: {
      height: 44,
      marginTop: 8,
      paddingLeft: 18,
      paddingRight: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 1,
      borderRadius: 11
    },
    fieldInput: {
      flex: 1,
      minWidth: 0,
      height: "100%",
      padding: 0,
      paddingRight: 10,
      fontSize: 15,
      lineHeight: 17,
      fontWeight: "500"
    },
    identityGrid: {
      marginTop: 12,
      flexDirection: "row",
      gap: 11
    },
    smallField: {
      flex: 1,
      minHeight: 60,
      paddingHorizontal: 18,
      paddingTop: 12,
      borderWidth: 1,
      borderRadius: 11
    },
    smallFieldValue: {
      marginTop: 9,
      fontSize: 14,
      lineHeight: 16,
      fontWeight: "900",
      letterSpacing: 0.4
    },
    selectField: {
      height: 40,
      marginTop: 8,
      paddingHorizontal: 15,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderRadius: 9
    },
    selectText: {
      flex: 1,
      minWidth: 0,
      fontSize: 13,
      lineHeight: 15,
      fontWeight: "600"
    },
    chevronOpen: {
      transform: [{ rotate: "180deg" }]
    },
    optionMenu: {
      marginTop: 6,
      padding: 4,
      borderWidth: 1,
      borderRadius: 9,
      overflow: "hidden"
    },
    optionRow: {
      minHeight: 34,
      paddingHorizontal: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderRadius: 6
    },
    optionText: {
      flex: 1,
      minWidth: 0,
      fontSize: 12,
      lineHeight: 15,
      fontWeight: "600"
    },
    optionDot: {
      width: 6,
      height: 6,
      marginLeft: 8,
      borderRadius: 3
    },
    rangeBlock: {
      marginTop: 16
    },
    rangeRow: {
      marginTop: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 10
    },
    rangeValue: {
      fontSize: 11,
      lineHeight: 13,
      fontWeight: "600"
    },
    volumeValue: {
      width: 30,
      textAlign: "right"
    },
    sliderTouchArea: {
      flex: 1,
      height: 34,
      justifyContent: "center"
    },
    sliderTrack: {
      height: 5,
      borderRadius: 999,
      position: "relative"
    },
    sliderFill: {
      height: 5,
      borderRadius: 999
    },
    sectionHeader:{flexDirection:"row",alignItems:"center"},
    sliderThumbInner:{width:8,height:8,borderRadius:4,backgroundColor:"#fff"},
    sliderThumb: {
      position: "absolute",
      top: -9.5,
      width: 24,
      height: 24,
      marginLeft: -12,
      borderRadius: 12,
      shadowColor: colors.blue,
      shadowOpacity: 0.28,
      shadowRadius: 9,
      shadowOffset: { width: 0, height: 3 },
      elevation: 4
    },
    performanceGrid: {
      marginTop: 18,
      flexDirection: "row",
      gap: 17
    },
    performanceLeft: {
      flex: 1
    },
    performanceRight: {
      width: 128
    },
    segmentBox: {
      height: 34,
      marginTop: 8,
      flexDirection: "row",
      overflow: "hidden",
      borderRadius: 8
    },
    segmentItem: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center"
    },
    segmentText: {
      fontSize: 12,
      lineHeight: 14,
      fontWeight: "700"
    },
    resolutionField: {
      height: 40,
      marginTop: 8,
      paddingHorizontal: 15,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 9
    },
    bitrateBlock: {
      marginTop: 16
    },
    bitrateLabelRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 12
    },
    historyList: {
      marginTop: 14,
      gap: 10
    },
    historyItem: {
      minHeight: 68,
      padding: 10,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 12
    },
    historyIcon: {
      width: 38,
      height: 38,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10
    },
    historyCopy: {
      flex: 1,
      minWidth: 0,
      marginLeft: 10
    },
    historyTitle: {
      fontSize: 13,
      lineHeight: 16,
      fontWeight: "900"
    },
    historyMeta: {
      marginTop: 5,
      fontSize: 11,
      lineHeight: 13,
      fontWeight: "600"
    },
    historyRight: {
      marginLeft: 8,
      alignItems: "flex-end"
    },
    historyStatus: {
      fontSize: 11,
      lineHeight: 13,
      fontWeight: "900"
    },
    historyTime: {
      marginTop: 5,
      fontSize: 10,
      lineHeight: 12,
      fontWeight: "600"
    },
    emptyStateCard: {
      minHeight: 238,
      marginTop: 24,
      paddingHorizontal: 24,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderRadius: 18,
      shadowOpacity: 0.06,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2
    },
    emptyIconWrap: {
      width: 58,
      height: 58,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 18
    },
    emptyTitle: {
      marginTop: 12,
      fontSize: 16,
      lineHeight: 19,
      fontWeight: "900",
      textAlign: "center"
    },
    emptyCopy: {
      marginTop: 8,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "600",
      textAlign: "center"
    },
    themeCard: {
      minHeight: 76,
      marginTop: 14,
      paddingHorizontal: 20,
      paddingVertical: 13,
      flexDirection: "row",
      alignItems: "center",
      gap: 18,
      borderWidth: 1,
      borderRadius: 18,
      shadowOpacity: 0.06,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2
    },
    themeToggle: {
      flex: 1,
      height: 50,
      padding: 4,
      flexDirection: "row",
      gap: 4,
      borderWidth: 1,
      borderRadius: 28
    },
    themeOption: {
      flex: 1,
      height: "100%",
      paddingHorizontal: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 24
    },
    themeText: {
      flex: 1,
      fontSize: 12,
      lineHeight: 13,
      fontWeight: "700"
    },
    themeRadio: {
      width: 16,
      height: 16,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.7,
      borderRadius: 8
    },
    themeRadioDot: {
      width: 6,
      height: 6,
      borderRadius: 3
    },
    bottomNav: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: 82,
      paddingHorizontal: 18,
      paddingTop: 12,
      paddingBottom: 10,
      flexDirection: "row",
      justifyContent: "space-between",
      borderTopWidth: 1
    },
    navItem: {
      width: 72,
      height: 58,
      alignItems: "center",
      justifyContent: "center",
      gap: 7
    },
    navText: {
      fontSize: 9,
      lineHeight: 11,
      fontWeight: "700"
    },
    fileIconWrap: {
      width: 24,
      height: 24,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 6
    }
  });
}

const styles = {};

function ProfileIcon({ color }) {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={3.25} stroke={color} strokeWidth={1.7} />
      <Path d="M6.75 20c.65-3.05 2.55-4.58 5.25-4.58S16.6 16.95 17.25 20" stroke={color} strokeWidth={1.7} />
    </Svg>
  );
}

function PhoneIcon({ color, large }) {
  return (
    <Svg width={large ? 44 : 38} height={large ? 64 : 56} viewBox="0 0 40 58">
      <Rect
        x={large ? 5 : 7.5}
        y={large ? 2.5 : 3}
        width={large ? 30 : 25}
        height={large ? 53 : 52}
        rx={large ? 5.5 : 4}
        stroke={color}
        strokeWidth={2.8}
      />
      <Path d={large ? "M15 47.5h10" : "M16 48h8"} stroke={color} strokeWidth={2.8} />
    </Svg>
  );
}

function LaptopIcon({ color, large }) {
  return (
    <Svg width={large ? 52 : 48} height={large ? 50 : 46} viewBox="0 0 46 42">
      <Rect x={9} y={5} width={28} height={22} rx={2.5} stroke={color} strokeWidth={2.8} />
      <Path d="M5 35h36l-4.5-8h-27zM19 32h8" stroke={color} strokeWidth={2.8} />
      <Circle cx={15} cy={10} r={1} fill={color} />
    </Svg>
  );
}

function WifiIcon({ dimmed }) {
  return (
    <Svg width={55} height={45} viewBox="0 0 52 42" opacity={dimmed ? 0.35 : 1}>
      <Path d="M7 16.8c11-9.4 27.9-9.4 39 0" stroke="#12bde8" strokeWidth={7} />
      <Path d="M16.2 25.5c5.8-5 13.8-5 19.6 0" stroke="#1478f8" strokeWidth={7} />
      <Circle cx={26} cy={35.2} r={4.4} fill="#5965ff" />
    </Svg>
  );
}

function ChevronIcon({ color }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={2} />
    </Svg>
  );
}

function HomeIcon({ color }) {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24">
      <Path d="M4 10.7L12 4l8 6.7M6.5 10.2V20h15v-9.8M10 20v-5h4v5" stroke={color} strokeWidth={1.75} />
    </Svg>
  );
}

function MonitorIcon({ color, small }) {
  return (
    <Svg width={small ? 18 : 23} height={small ? 18 : 23} viewBox="0 0 24 24">
      <Rect x={4} y={5} width={16} height={12} rx={1.5} stroke={color} strokeWidth={1.75} />
      <Path d="M9 21h6M12 17v4" stroke={color} strokeWidth={1.75} />
    </Svg>
  );
}

function FolderIcon({ color }) {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24">
      <Path
        d="M7 7.2h4l1.45 1.65H18a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9.2a2 2 0 0 1 2-2z"
        stroke={color}
        strokeWidth={1.75}
      />
    </Svg>
  );
}

function GearIcon({ color }) {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={1.75} />
      <Path
        d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.05.05a2 2 0 1 1-2.83 2.83l-.05-.05a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.47V21a2 2 0 1 1-4 0v-.08a1.6 1.6 0 0 0-1-1.47 1.6 1.6 0 0 0-1.8.3l-.05.05a2 2 0 1 1-2.83-2.83l.05-.05a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.47-1H3a2 2 0 1 1 0-4h.08a1.6 1.6 0 0 0 1.47-1 1.6 1.6 0 0 0-.3-1.8l-.05-.05A2 2 0 1 1 7.03 4.4l.05.05a1.6 1.6 0 0 0 1.8.3 1.6 1.6 0 0 0 1-1.47V3a2 2 0 1 1 4 0v.08a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.8-.3l.05-.05a2 2 0 1 1 2.83 2.83l-.05.05a1.6 1.6 0 0 0-.3 1.8 1.6 1.6 0 0 0 1.47 1H21a2 2 0 1 1 0 4h-.08A1.6 1.6 0 0 0 19.4 15z"
        stroke={color}
        strokeWidth={1.75}
      />
    </Svg>
  );
}

function EditIcon({ color }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path d="M16.85 4.55l2.6 2.6M5 19l4.15-.82L18.65 8.7l-3.35-3.35-9.48 9.5z" stroke={color} strokeWidth={2} />
    </Svg>
  );
}


function SpeedIcon({ color }) {
  return (<Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M5 16a7 7 0 1114 0" stroke={color} strokeWidth={2} strokeLinecap="round"/><Path d="M12 12l4-3" stroke={color} strokeWidth={2} strokeLinecap="round"/><Circle cx={12} cy={16} r={1.6} fill={color}/></Svg>);
}

function DownIcon({ color }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path d="M7 10l5 5 5-5" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function VolumeIcon({ color, muted }) {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24">
      <Path d="M4 9v6h4l5 4V5L8 9z" stroke={color} strokeWidth={1.8} />
      {muted ? (
        <Path d="M16 9l5 6M21 9l-5 6" stroke={color} strokeWidth={1.8} />
      ) : (
        <Path d="M16 8.2a5 5 0 0 1 0 7.6" stroke={color} strokeWidth={1.8} />
      )}
    </Svg>
  );
}

function SendIcon({ color, small }) {
  return (
    <Svg width={small ? 17 : 20} height={small ? 17 : 20} viewBox="0 0 24 24">
      <Path d="M4 12h13M12 7l5 5-5 5M5 5h14v14H5z" stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

function ReceiveIcon({ color, small }) {
  return (
    <Svg width={small ? 17 : 20} height={small ? 17 : 20} viewBox="0 0 24 24">
      <Path d="M20 12H7M12 7l-5 5 5 5M5 5h14v14H5z" stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

function SunIcon({ color }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={3.5} stroke={color} strokeWidth={1.7} />
      <Path
        d="M12 2.5v2.2M12 19.3v2.2M4.55 4.55l1.55 1.55M17.9 17.9l1.55 1.55M2.5 12h2.2M19.3 12h2.2M4.55 19.45l1.55-1.55M17.9 6.1l1.55-1.55"
        stroke={color}
        strokeWidth={1.7}
      />
    </Svg>
  );
}

function MoonIcon({ color }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      <Path d="M19.5 15.1A7.7 7.7 0 0 1 8.9 4.5 8 8 0 1 0 19.5 15.1z" stroke={color} strokeWidth={1.7} />
    </Svg>
  );
}
