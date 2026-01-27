/**
 * Expo Config Plugin for Daydate Widget
 *
 * This plugin copies widget source files and configures App Groups.
 * The widget target must be added manually in Xcode.
 */

const {
  withEntitlementsPlist,
  withDangerousMod,
} = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

// Widget configuration
const WIDGET_NAME = 'DaydateWidget';
const APP_GROUP_ID = 'group.com.daydate.app';

/**
 * Copy directory recursively
 */
function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`[withDaydateWidget] Source directory not found: ${src}`);
    return false;
  }

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }

  return true;
}

/**
 * Copy widget source files to ios directory
 */
function withWidgetSourceFiles(config) {
  return withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const nativeWidgetsPath = path.join(projectRoot, 'native-widgets', 'ios');
      const iosPath = path.join(projectRoot, 'ios');
      const appName = modConfig.modRequest.projectName || 'Daydate';

      // Copy DaydateWidget folder
      const widgetSrc = path.join(nativeWidgetsPath, WIDGET_NAME);
      const widgetDest = path.join(iosPath, WIDGET_NAME);

      if (copyDirSync(widgetSrc, widgetDest)) {
        console.log(`[withDaydateWidget] ✅ Copied widget files to ${widgetDest}`);
      }

      // Copy WidgetDataModule files to main app folder
      const mainAppPath = path.join(iosPath, appName);

      const moduleFiles = ['WidgetDataModule.swift', 'WidgetDataModule.m'];
      for (const file of moduleFiles) {
        const srcFile = path.join(nativeWidgetsPath, file);
        const destFile = path.join(mainAppPath, file);

        if (fs.existsSync(srcFile)) {
          fs.copyFileSync(srcFile, destFile);
          console.log(`[withDaydateWidget] ✅ Copied ${file} to ${mainAppPath}`);
        }
      }

      console.log(`[withDaydateWidget] ⚠️  Widget target must be added manually in Xcode`);
      console.log(`[withDaydateWidget] ⚠️  See: ios/${WIDGET_NAME}/ folder`);

      return modConfig;
    },
  ]);
}

/**
 * Add App Groups entitlement to main app
 */
function withAppGroupsEntitlement(config) {
  return withEntitlementsPlist(config, (modConfig) => {
    modConfig.modResults['com.apple.security.application-groups'] = [APP_GROUP_ID];
    console.log(`[withDaydateWidget] ✅ Added App Groups entitlement: ${APP_GROUP_ID}`);
    return modConfig;
  });
}

/**
 * Main plugin function
 */
function withDaydateWidget(config) {
  // Step 1: Copy source files
  config = withWidgetSourceFiles(config);

  // Step 2: Add App Groups entitlement to main app
  config = withAppGroupsEntitlement(config);

  return config;
}

module.exports = withDaydateWidget;
