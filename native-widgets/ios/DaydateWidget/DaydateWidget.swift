//
//  DaydateWidget.swift
//  DaydateWidget
//
//  Calendar widget for Daydate app
//

import WidgetKit
import SwiftUI
import UIKit

// MARK: - Data Models

struct StoredDateEntry: Codable {
    let date: String // "YYYY-MM-DD" format
    let localImagePath: String?
}

struct WidgetData: Codable {
    let dateRecords: [StoredDateEntry]
    let isLoggedIn: Bool
}

// MARK: - Timeline Entry

struct DaydateEntry: TimelineEntry {
    let date: Date
    let dateRecords: [String: String] // date -> local image path
    let isLoggedIn: Bool
}

// MARK: - Timeline Provider

struct DaydateProvider: TimelineProvider {
    private let appGroupIdentifier = "group.com.daydate.app"

    func placeholder(in context: Context) -> DaydateEntry {
        DaydateEntry(date: Date(), dateRecords: [:], isLoggedIn: false)
    }

    func getSnapshot(in context: Context, completion: @escaping (DaydateEntry) -> ()) {
        let (missions, isLoggedIn) = loadWidgetData()
        let entry = DaydateEntry(date: Date(), dateRecords: missions, isLoggedIn: isLoggedIn)
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<DaydateEntry>) -> ()) {
        let currentDate = Date()
        let (missions, isLoggedIn) = loadWidgetData()

        let entry = DaydateEntry(date: currentDate, dateRecords: missions, isLoggedIn: isLoggedIn)

        let calendar = Calendar.current
        let tomorrow = calendar.startOfDay(for: calendar.date(byAdding: .day, value: 1, to: currentDate)!)

        let timeline = Timeline(entries: [entry], policy: .after(tomorrow))
        completion(timeline)
    }

    private func loadWidgetData() -> ([String: String], Bool) {
        guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier),
              let data = sharedDefaults.data(forKey: "widgetData"),
              let widgetData = try? JSONDecoder().decode(WidgetData.self, from: data) else {
            return ([:], false)
        }

        // Get the shared App Group container URL
        let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)

        var result: [String: String] = [:]
        for entry in widgetData.dateRecords {
            if let localPath = entry.localImagePath, !localPath.isEmpty {
                // The path from native module is an absolute path to the App Group container
                // Check if file exists at the stored path
                if FileManager.default.fileExists(atPath: localPath) {
                    result[entry.date] = localPath
                } else if let containerURL = containerURL {
                    // Fallback: try to find in WidgetImages directory with just the filename
                    let filename = (localPath as NSString).lastPathComponent
                    let fallbackPath = containerURL.appendingPathComponent("WidgetImages").appendingPathComponent(filename).path
                    if FileManager.default.fileExists(atPath: fallbackPath) {
                        result[entry.date] = fallbackPath
                    }
                }
            }
        }
        return (result, widgetData.isLoggedIn)
    }
}

// MARK: - Small Widget View with Calendar

struct SmallWidgetView: View {
    let entry: DaydateEntry
    @Environment(\.colorScheme) var colorScheme

    // Korean weekdays: 일월화수목금토 (Sunday first)
    private let weekDaysKorean = ["일", "월", "화", "수", "목", "금", "토"]
    // English weekdays: SMTWTFS (Sunday first)
    private let weekDaysEnglish = ["S", "M", "T", "W", "T", "F", "S"]

    private var calendar: Calendar {
        var cal = Calendar.current
        cal.firstWeekday = 1 // Sunday
        return cal
    }

    // Always white background
    private var backgroundColor: Color {
        Color.white
    }

    // Always black text
    private var textColor: Color {
        Color.black
    }

    private var secondaryTextColor: Color {
        Color.gray
    }

    private var accentColor: Color {
        Color(red: 0.95, green: 0.4, blue: 0.4)
    }

    // Check if device language is Korean
    private var isKorean: Bool {
        let languageCode = Locale.current.languageCode ?? ""
        return languageCode == "ko"
    }

    // Get weekdays based on device language
    private var weekDays: [String] {
        isKorean ? weekDaysKorean : weekDaysEnglish
    }

    // Month format: Korean → "1월", Others → "JANUARY" (uppercase)
    private var monthDisplay: String {
        let formatter = DateFormatter()
        if isKorean {
            formatter.locale = Locale(identifier: "ko_KR")
            formatter.dateFormat = "M월"
            return formatter.string(from: entry.date)
        } else {
            formatter.locale = Locale(identifier: "en_US")
            formatter.dateFormat = "MMMM"
            return formatter.string(from: entry.date).uppercased()
        }
    }

    private var daysInMonth: [Date?] {
        let startOfMonth = calendar.date(from: calendar.dateComponents([.year, .month], from: entry.date))!
        let range = calendar.range(of: .day, in: .month, for: startOfMonth)!

        let firstWeekday = calendar.component(.weekday, from: startOfMonth)
        let offsetDays = firstWeekday - 1

        var days: [Date?] = Array(repeating: nil, count: offsetDays)

        for day in range {
            if let date = calendar.date(byAdding: .day, value: day - 1, to: startOfMonth) {
                days.append(date)
            }
        }

        while days.count < 42 {
            days.append(nil)
        }

        return days
    }

    private func dateString(from date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private func isToday(_ date: Date) -> Bool {
        calendar.isDateInToday(date)
    }

    private func isSunday(_ date: Date) -> Bool {
        calendar.component(.weekday, from: date) == 1
    }

    private func isSaturday(_ date: Date) -> Bool {
        calendar.component(.weekday, from: date) == 7
    }

    var body: some View {
        GeometryReader { geometry in
            let horizontalPadding: CGFloat = 8
            let topPadding: CGFloat = 10
            let bottomPadding: CGFloat = 4
            let availableWidth = geometry.size.width - (horizontalPadding * 2)
            let availableHeight = geometry.size.height - topPadding - bottomPadding
            let headerHeight: CGFloat = 14
            let weekdayHeight: CGFloat = 10
            let calendarHeight = availableHeight - headerHeight - weekdayHeight - 4
            let cellSize = min(availableWidth / 7, calendarHeight / 6)

            ZStack {
                backgroundColor

                let gridWidth = cellSize * 7

                VStack(alignment: .leading, spacing: 2) {
                    // Header: Month - aligned with calendar grid left edge
                    Text(monthDisplay)
                        .font(.system(size: 9, weight: .bold, design: .rounded))
                        .foregroundColor(textColor)
                        .frame(width: gridWidth, alignment: .leading)
                        .frame(height: headerHeight)

                    // Weekday headers: 일월화수목금토
                    HStack(spacing: 0) {
                        ForEach(0..<7, id: \.self) { index in
                            Text(weekDays[index])
                                .font(.system(size: 9, weight: .semibold))
                                .foregroundColor(index == 0 ? accentColor : (index == 6 ? Color.blue.opacity(0.7) : secondaryTextColor))
                                .frame(width: cellSize)
                        }
                    }
                    .frame(width: gridWidth, height: weekdayHeight)

                    // Calendar grid
                    let columns = Array(repeating: GridItem(.fixed(cellSize), spacing: 0), count: 7)

                    LazyVGrid(columns: columns, spacing: 0) {
                        ForEach(0..<42, id: \.self) { index in
                            if index < daysInMonth.count, let date = daysInMonth[index] {
                                CalendarDayCell(
                                    date: date,
                                    isToday: isToday(date),
                                    isSunday: isSunday(date),
                                    isSaturday: isSaturday(date),
                                    localImagePath: entry.dateRecords[dateString(from: date)],
                                    cellSize: cellSize,
                                    textColor: textColor,
                                    accentColor: accentColor,
                                    colorScheme: colorScheme
                                )
                            } else {
                                Color.clear
                                    .frame(width: cellSize, height: cellSize)
                            }
                        }
                    }
                    .frame(width: gridWidth)
                }
                .padding(.horizontal, horizontalPadding)
                .padding(.top, topPadding)
                .padding(.bottom, bottomPadding)
            }
        }
    }
}

// MARK: - Calendar Day Cell

struct CalendarDayCell: View {
    let date: Date
    let isToday: Bool
    let isSunday: Bool
    let isSaturday: Bool
    let localImagePath: String?
    let cellSize: CGFloat
    let textColor: Color
    let accentColor: Color
    let colorScheme: ColorScheme

    private var dayNumber: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "d"
        return formatter.string(from: date)
    }

    private var hasPhoto: Bool {
        if let path = localImagePath {
            return FileManager.default.fileExists(atPath: path)
        }
        return false
    }

    private var localImage: UIImage? {
        guard let path = localImagePath else { return nil }
        return UIImage(contentsOfFile: path)
    }

    private var dayTextColor: Color {
        if hasPhoto {
            return .white
        }
        if isSunday {
            return accentColor
        }
        if isSaturday {
            return Color.blue.opacity(0.8)
        }
        return textColor
    }

    var body: some View {
        ZStack {
            // Background with date record photo from local cache
            if let uiImage = localImage {
                Image(uiImage: uiImage)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: cellSize - 1, height: cellSize - 1)
                    .clipped()
                    .clipShape(RoundedRectangle(cornerRadius: 3))
                    .overlay(
                        Color.black.opacity(0.3)
                            .clipShape(RoundedRectangle(cornerRadius: 3))
                    )
            }

            // Today indicator - hollow white circle with border only
            if isToday {
                Circle()
                    .stroke(Color.black, lineWidth: 1.5)
                    .frame(width: cellSize - 3, height: cellSize - 3)
            }

            // Day number
            Text(dayNumber)
                .font(.system(size: cellSize * 0.5, weight: isToday ? .bold : .medium, design: .rounded))
                .foregroundColor(dayTextColor)
        }
        .frame(width: cellSize, height: cellSize)
    }
}

// MARK: - Widget Configuration

struct DaydateWidget: Widget {
    let kind: String = "DaydateWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DaydateProvider()) { entry in
            if #available(iOS 17.0, *) {
                SmallWidgetView(entry: entry)
                    .containerBackground(for: .widget) {
                        Color.clear
                    }
            } else {
                SmallWidgetView(entry: entry)
            }
        }
        .configurationDisplayName("Daydate")
        .description("데이트 캘린더")
        .supportedFamilies([.systemSmall])
        .contentMarginsDisabled()
    }
}

// MARK: - Preview

@available(iOS 17.0, *)
#Preview(as: .systemSmall) {
    DaydateWidget()
} timeline: {
    // Preview with no cached images (local paths would be set by the app)
    DaydateEntry(date: .now, dateRecords: [:], isLoggedIn: true)
}
