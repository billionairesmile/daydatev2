//
//  WidgetDataModule.swift
//  Daydate
//
//  Native module for syncing widget data from React Native to iOS Widget
//

import Foundation
import WidgetKit

// Data structure for parsing incoming JSON
private struct IncomingWidgetData: Codable {
    let dateRecords: [IncomingDateEntry]
    let isLoggedIn: Bool
}

private struct IncomingDateEntry: Codable {
    let date: String
    let photoUrl: String?
}

// Data structure for storing in widget
private struct StoredWidgetData: Codable {
    let dateRecords: [StoredDateEntry]
    let isLoggedIn: Bool
}

private struct StoredDateEntry: Codable {
    let date: String
    let localImagePath: String?
}

@objc(WidgetDataModule)
class WidgetDataModule: NSObject {
    private let appGroupIdentifier = "group.com.daydate.app"

    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }

    // Get App Group container URL
    private func getAppGroupContainerURL() -> URL? {
        return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)
    }

    // Get images directory in App Group container
    private func getImagesDirectory() -> URL? {
        guard let containerURL = getAppGroupContainerURL() else { return nil }
        let imagesDir = containerURL.appendingPathComponent("WidgetImages", isDirectory: true)

        // Create directory if it doesn't exist
        if !FileManager.default.fileExists(atPath: imagesDir.path) {
            try? FileManager.default.createDirectory(at: imagesDir, withIntermediateDirectories: true)
        }

        return imagesDir
    }

    // Download and cache image locally
    private func cacheImage(from urlString: String, forDate date: String, completion: @escaping (String?) -> Void) {
        guard let url = URL(string: urlString),
              let imagesDir = getImagesDirectory() else {
            completion(nil)
            return
        }

        let fileName = "\(date).jpg"
        let localPath = imagesDir.appendingPathComponent(fileName)

        // Download image
        URLSession.shared.dataTask(with: url) { data, response, error in
            guard let data = data, error == nil else {
                print("[WidgetDataModule] Failed to download image: \(error?.localizedDescription ?? "unknown")")
                completion(nil)
                return
            }

            do {
                try data.write(to: localPath)
                print("[WidgetDataModule] Image cached at: \(localPath.path)")
                completion(localPath.path)
            } catch {
                print("[WidgetDataModule] Failed to save image: \(error.localizedDescription)")
                completion(nil)
            }
        }.resume()
    }

    @objc
    func updateWidgetData(_ jsonData: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        print("[WidgetDataModule] updateWidgetData called")

        guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier) else {
            print("[WidgetDataModule] ERROR: Failed to access shared UserDefaults")
            reject("ERROR", "Failed to access shared UserDefaults", nil)
            return
        }

        guard let data = jsonData.data(using: .utf8),
              let incomingData = try? JSONDecoder().decode(IncomingWidgetData.self, from: data) else {
            print("[WidgetDataModule] ERROR: Failed to parse JSON data")
            reject("ERROR", "Failed to parse JSON data", nil)
            return
        }

        print("[WidgetDataModule] Processing \(incomingData.dateRecords.count) date records")

        let dispatchGroup = DispatchGroup()
        var storedEntries: [StoredDateEntry] = []
        let entriesLock = NSLock()

        for entry in incomingData.dateRecords {
            if let photoUrl = entry.photoUrl, !photoUrl.isEmpty {
                dispatchGroup.enter()
                cacheImage(from: photoUrl, forDate: entry.date) { localPath in
                    entriesLock.lock()
                    storedEntries.append(StoredDateEntry(date: entry.date, localImagePath: localPath))
                    entriesLock.unlock()
                    dispatchGroup.leave()
                }
            } else {
                entriesLock.lock()
                storedEntries.append(StoredDateEntry(date: entry.date, localImagePath: nil))
                entriesLock.unlock()
            }
        }

        dispatchGroup.notify(queue: .main) {
            let storedData = StoredWidgetData(dateRecords: storedEntries, isLoggedIn: incomingData.isLoggedIn)

            guard let encodedData = try? JSONEncoder().encode(storedData) else {
                print("[WidgetDataModule] ERROR: Failed to encode stored data")
                reject("ERROR", "Failed to encode stored data", nil)
                return
            }

            sharedDefaults.set(encodedData, forKey: "widgetData")
            sharedDefaults.synchronize()

            print("[WidgetDataModule] Data saved with \(storedEntries.count) date records")

            // Refresh widget timeline
            if #available(iOS 14.0, *) {
                WidgetCenter.shared.reloadAllTimelines()
                print("[WidgetDataModule] Widget timeline reload requested")
            }

            resolve(true)
        }
    }

    @objc
    func getWidgetData(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        print("[WidgetDataModule] getWidgetData called")

        guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier) else {
            print("[WidgetDataModule] ERROR: Failed to access shared UserDefaults")
            reject("ERROR", "Failed to access shared UserDefaults", nil)
            return
        }

        if let data = sharedDefaults.data(forKey: "widgetData"),
           let jsonString = String(data: data, encoding: .utf8) {
            print("[WidgetDataModule] Retrieved data: \(jsonString)")
            resolve(jsonString)
        } else {
            print("[WidgetDataModule] No widget data found")
            resolve(nil)
        }
    }

    @objc
    func clearWidgetData(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        print("[WidgetDataModule] clearWidgetData called")

        guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier) else {
            print("[WidgetDataModule] ERROR: Failed to access shared UserDefaults")
            reject("ERROR", "Failed to access shared UserDefaults", nil)
            return
        }

        sharedDefaults.removeObject(forKey: "widgetData")
        sharedDefaults.synchronize()

        print("[WidgetDataModule] Widget data cleared")

        // Refresh widget timeline
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }

        resolve(true)
    }
}
