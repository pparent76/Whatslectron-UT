#!/bin/bash
set -e  # Exit immediately on error
if [ "$UNCONFINED" = "true" ]; then
echo "WARNING: building unconfined!"
fi


lsb_release -a
# ========================
# PROJECT CONFIGURATION
# ========================
PROJECT_NAME="signalut"
INSTALL_DIR="${BUILD_DIR}/install"

# ========================
# STEP 1: CLONE SIGNAL-DESKTOP
# ========================
echo "[1/9] Copy whatslectron src"
cp -r ${ROOT}/whatslectron-src ${BUILD_DIR} || true
cd ${BUILD_DIR}/whatslectron-src


# ==============================
# STEP 2: Build whatslectron
# ==============================
echo "[2/9] Building whatslectron..."

 if [ ! -e "${BUILD_DIR}/whatslectron-src/linux-arm64-unpacked/" ]; then
 PATH=$PATH:${BUILD_DIR}/.clickable/home/.local/share/pnpm/
    
    echo "---> Installing nvm"
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash || true
    export NVM_DIR="$HOME/.nvm"
    echo "---> load nvm: $NVM_DIR"
    . "$NVM_DIR/nvm.sh" || true # This loads nvm

    echo "---> nvm install 24.15.0"
    nvm install 24.15.0
    nvm use 24.15.0
    node -v
    
    echo "---> pnpm install"
    curl -fsSL https://get.pnpm.io/install.sh | env SHELL=bash sh -
    source ${BUILD_DIR}/.clickable/home/.bashrc

    #pnpm add -g node-gyp
    pnpm -v
  
    echo "--->add"
    pnpm dlx node-gyp --version
  
    export npm_config_arch=x64
    export npm_config_target_arch=arm64
    export npm_config_target_platform=linux
    export ESBUILD_ARCH=arm64
    export SIGNAL_ENV=release
    
    echo "Install"
    sleep 5
    pnpm install  --dangerously-allow-all-builds --verbose  --network-concurrency=1 --child-concurrency=1
       
    echo "Build whatslectron"
    sleep 5;
    # This is the equivalent of 'npm run build-linux' with some adjustments
    pnpm run build:esbuild
    pnpm run build --linux --arm64

  fi


# ===================================
# STEP 3: BUILD THE FAKE xdg-open
# ===================================
echo "[3/9] Building fake xdg-open & placeholder-killer ..."
cp -r ${ROOT}/utils/xdg-open/ ${BUILD_DIR}/
cd ${BUILD_DIR}/xdg-open/
mkdir -p build
cd build
cmake ..
make

cp -r ${ROOT}/utils/placeholder-killer/ ${BUILD_DIR}/
cd ${BUILD_DIR}/placeholder-killer/
mkdir -p build
cd build
cmake ..
make

rm -rvf  ${BUILD_DIR}/restart-app/
cp -r ${ROOT}/utils/restart-app/ ${BUILD_DIR}/
cd ${BUILD_DIR}/restart-app/
unset PKG_CONFIG_PATH
export PKG_CONFIG_LIBDIR=/usr/lib/aarch64-linux-gnu/pkgconfig:/usr/share/pkgconfig
aarch64-linux-gnu-gcc -Wall -Wextra restart-app.c -o restart-app $(pkg-config --cflags --libs gio-2.0)

# ===================================
# STEP 4: BUILD QML modules
# ===================================
echo "[4/9] Building QML modules ..."
rm -rvf ${BUILD_DIR}/download-helper
cp -r ${ROOT}/utils/download-helper/ ${BUILD_DIR}/download-helper
cd ${BUILD_DIR}/download-helper/qml-download-helper-module/
mkdir build
cd build
cmake ..
cmake --build .

rm -rvf ${BUILD_DIR}/upload-helper
cp -r ${ROOT}/utils/upload-helper/ ${BUILD_DIR}/upload-helper
cd ${BUILD_DIR}/upload-helper/qml-upload-helper-module/
mkdir build
cd build
cmake ..
cmake --build .

rm -rvf ${BUILD_DIR}/mic-permission-requester/
cp -r ${ROOT}/utils/mic-permission-requester/ ${BUILD_DIR}/mic-permission-requester
cd ${BUILD_DIR}/mic-permission-requester/AudioModule/
mkdir build
cd build
cmake ..
cmake --build .

# =================================================
# STEP 5: Build libnotify
# =================================================
echo "[5/9] Building libnotify..."

rm -rvf ${BUILD_DIR}/libnotify || true
mkdir -p ${BUILD_DIR}/libnotify
cd ${BUILD_DIR}/libnotify

PKGNAME="libnotify"
VERSION="0.8.3"
ORIG_URL="https://ports.ubuntu.com/pool/main/libn/libnotify/libnotify_0.8.3.orig.tar.xz"
DEBIAN_URL="https://ports.ubuntu.com/pool/main/libn/libnotify/libnotify_0.8.3-1build2.debian.tar.xz"

echo "📦 Download sources..."
wget -q "$ORIG_URL" -O "${PKGNAME}_${VERSION}.orig.tar.xz"
wget -q "$DEBIAN_URL" -O "${PKGNAME}_${VERSION}.debian.tar.xz"

echo "📂 Extract original code..."
tar -xf "${PKGNAME}_${VERSION}.orig.tar.xz"
SRC_DIR_LIBNOTIFY=$(tar -tf "${PKGNAME}_${VERSION}.orig.tar.xz" | head -1 | cut -d/ -f1)

echo "📂 Extract debian files..."
tar -xf "${PKGNAME}_${VERSION}.debian.tar.xz" -C "$SRC_DIR_LIBNOTIFY"

echo "Apply patch..."
cd ${BUILD_DIR}/libnotify/$SRC_DIR_LIBNOTIFY/
patch -p1 < ${ROOT}/patches/libnotify/notification.c.diff

EDITOR=true dpkg-source --commit . ut-notif
DEB_BUILD_OPTIONS=nocheck dpkg-buildpackage -us -uc -a arm64


# =================================================
# STEP 6: Install dependencies
# =================================================
echo "[6/9] Install dependencies..."

cd ${BUILD_DIR}
DEPENDENCIES="libhybris-utils xdotool libmaliit-glib2 libxdo3 x11-utils"

for dep in $DEPENDENCIES ; do
    apt download $dep:arm64
    mv ${dep}_*.deb ${dep}.deb
    rm -rvf "${dep}.deb_extract_chsdjksd" || true
    mkdir "${dep}.deb_extract_chsdjksd"
    dpkg-deb -x "${dep}.deb" "${dep}.deb_extract_chsdjksd"
done

wget https://ports.ubuntu.com/pool/main/c/coreutils/coreutils_9.4-3ubuntu6_arm64.deb
rm -rvf "coreutils_9.4-3ubuntu6_arm64.deb_extract_chsdjksd" || true
mkdir "coreutils_9.4-3ubuntu6_arm64.deb_extract_chsdjksd"
dpkg-deb -x "coreutils_9.4-3ubuntu6_arm64.deb" "coreutils_9.4-3ubuntu6_arm64.deb_extract_chsdjksd"

# =================================================
# STEP 7: Downloading maliit-inputcontext-gtk3
# =================================================
echo "[7/9] Building maliit-inputcontext-gtk3 and download dependencies..."


PKGNAME="maliit-inputcontext-gtk"
VERSION="0.99.1+git20151116.72d7576"
ORIG_URL="https://ports.ubuntu.com/ubuntu-ports/ubuntu-ports/pool/universe/m/maliit-inputcontext-gtk/maliit-inputcontext-gtk_0.99.1+git20151116.72d7576.orig.tar.xz"
DEBIAN_URL="https://ports.ubuntu.com/ubuntu-ports/ubuntu-ports/pool/universe/m/maliit-inputcontext-gtk/maliit-inputcontext-gtk_0.99.1+git20151116.72d7576-3build3.debian.tar.xz"



WORKDIR_MALIIT="${BUILD_DIR}/${PKGNAME}-${VERSION}"
rm -rvf $WORKDIR_MALIIT/ || true
mkdir -p "$WORKDIR_MALIIT"
cd "$WORKDIR_MALIIT"

echo "📦 Download sources..."
wget -q "$ORIG_URL" -O "${PKGNAME}_${VERSION}.orig.tar.xz"
wget -q "$DEBIAN_URL" -O "${PKGNAME}_${VERSION}.debian.tar.xz"

echo "📂 Extract original code..."
tar -xf "${PKGNAME}_${VERSION}.orig.tar.xz"
SRC_DIR_MALIIT=$(tar -tf "${PKGNAME}_${VERSION}.orig.tar.xz" | head -1 | cut -d/ -f1)

echo "📂 Extract debian files..."
tar -xf "${PKGNAME}_${VERSION}.debian.tar.xz" -C "$SRC_DIR_MALIIT"

echo "Apply patch..."
cd ${BUILD_DIR}/$SRC_DIR_MALIIT/maliit-inputcontext-gtk-$VERSION/
patch ${BUILD_DIR}/$SRC_DIR_MALIIT/maliit-inputcontext-gtk-$VERSION/gtk-input-context/client-gtk/client-imcontext-gtk.c  ${ROOT}/patches/maliit-inputcontext-gtk/client-imcontext-gtk.c.patch
echo "${ROOT}/patches/maliit-inputcontext-gtk/client-imcontext-gtk.c.patch"

echo "Compile..."
EDITOR=true dpkg-source --commit . fix-keyboard
DEB_BUILD_OPTIONS=nocheck dpkg-buildpackage -us -uc -a arm64



# ==============================
# STEP 8: Copying files
# ==============================  
echo "[8/9] Copying files..." 


echo "Copying dependencies..."
cd ${BUILD_DIR}
# Copie des fichiers du dossier /lib/ de chaque paquet
rm -rvf $INSTALL_DIR/lib
mkdir -p "$INSTALL_DIR/lib/aarch64-linux-gnu/gtk-3.0/3.0.0/immodules/"
for DIR in *_extract_chsdjksd; do
    if [ -d "$DIR/usr/lib/aarch64-linux-gnu/" ]; then
        cp -r "$DIR/usr/lib/aarch64-linux-gnu/"* "$INSTALL_DIR/lib/aarch64-linux-gnu/"
    fi
done

# Copy binaries in bin/
mkdir -p "$INSTALL_DIR/bin"
cp *_extract_chsdjksd/usr/bin/xdotool "$INSTALL_DIR/bin/"
cp *_extract_chsdjksd/usr/bin/getprop "$INSTALL_DIR/bin/"
cp *_extract_chsdjksd/usr/bin/xprop "$INSTALL_DIR/bin/"
cp *_extract_chsdjksd/usr/bin/xev "$INSTALL_DIR/bin/"
cp *_extract_chsdjksd/usr/bin/md5sum "$INSTALL_DIR/bin/"

echo "Copying signal-desktop..."
mkdir -p "$INSTALL_DIR/opt/whatslectron"
cp -r ${BUILD_DIR}/whatslectron-src/dist/linux-arm64-unpacked/* "$INSTALL_DIR/opt/whatslectron/" || true
mv $INSTALL_DIR/opt/whatslectron/whatsapp-electron $INSTALL_DIR/opt/whatslectron/whatslectron

echo "Copying maliit-input-context..."
cp $WORKDIR_MALIIT/maliit-inputcontext-gtk-$VERSION/builddir/gtk3/gtk-3.0/im-maliit.so $INSTALL_DIR/lib/aarch64-linux-gnu/gtk-3.0/3.0.0/immodules/

echo "Copying logos..."
cp ${ROOT}/icon.png "$INSTALL_DIR/"
cp ${ROOT}/icon-splash.png "$INSTALL_DIR/"

echo "Copying app files..."
cp ${ROOT}/whatslectron.desktop "$INSTALL_DIR/"
cp ${ROOT}/manifest.json "$INSTALL_DIR/"
cp ${ROOT}/whatslectron.apparmor "$INSTALL_DIR/"
cp ${ROOT}/launcher.sh "$INSTALL_DIR/"
cp ${ROOT}/pushexec "$INSTALL_DIR/"
cp ${ROOT}/push-apparmor.json "$INSTALL_DIR/"
cp ${ROOT}/whatslectron-push.apparmor "$INSTALL_DIR/"
cp ${ROOT}/whatslectron-push-helper.json "$INSTALL_DIR/"
cp ${ROOT}/whatslectron.url-dispatcher "$INSTALL_DIR/"

echo "Copying libnotify"
cp ${BUILD_DIR}/libnotify/libnotify-0.8.3/obj-aarch64-linux-gnu/libnotify/* $INSTALL_DIR/lib/aarch64-linux-gnu/ || true

echo "Copying utils..."
mkdir -p "$INSTALL_DIR/utils/"
cp ${ROOT}/utils/rm.sh "$INSTALL_DIR/utils/"
cp ${ROOT}/utils/sleep.sh "$INSTALL_DIR/utils/"
cp ${ROOT}/utils/mkdir.sh "$INSTALL_DIR/utils/"
cp ${ROOT}/utils/get-scale.sh "$INSTALL_DIR/utils/"
cp ${ROOT}/utils/select-file.sh "$INSTALL_DIR/utils/"
cp ${BUILD_DIR}/xdg-open/build/xdg-open $INSTALL_DIR/bin/
cp ${BUILD_DIR}/placeholder-killer/build/placeholder-killer $INSTALL_DIR/bin/
mkdir -p $INSTALL_DIR/utils/restart-app/
cp ${BUILD_DIR}/restart-app/restart-app $INSTALL_DIR/utils/restart-app/
mkdir $INSTALL_DIR/utils/download-helper/
cp -r ${BUILD_DIR}/download-helper/qml $INSTALL_DIR/utils/download-helper/
mkdir -p $INSTALL_DIR/utils/download-helper/Pparent/DownloadHelper
cp ${BUILD_DIR}/download-helper/qml-download-helper-module/build/libDownloadHelperPlugin.so $INSTALL_DIR/utils/download-helper/Pparent/DownloadHelper/
cp ${BUILD_DIR}/download-helper/qml-download-helper-module/qmldir $INSTALL_DIR/utils/download-helper/Pparent/DownloadHelper/

mkdir -p $INSTALL_DIR/utils/mic-permission-requester/AudioWriter/ || true
cp ${BUILD_DIR}/mic-permission-requester/AudioModule/libaudiowriter.so $INSTALL_DIR/utils/mic-permission-requester/AudioWriter/
cp ${BUILD_DIR}/mic-permission-requester/AudioModule/qmldir $INSTALL_DIR/utils/mic-permission-requester/AudioWriter/


mkdir $INSTALL_DIR/utils/upload-helper/
cp -r ${BUILD_DIR}/upload-helper/qml $INSTALL_DIR/utils/upload-helper/
mkdir -p $INSTALL_DIR/utils/upload-helper/Pparent/UploadHelper
cp ${BUILD_DIR}/upload-helper/qml-upload-helper-module/build/libUploadHelperPlugin.so $INSTALL_DIR/utils/upload-helper/Pparent/UploadHelper/
cp ${BUILD_DIR}/upload-helper/qml-upload-helper-module/qmldir $INSTALL_DIR/utils/upload-helper/Pparent/UploadHelper/


mkdir $INSTALL_DIR/utils/settings/
cp -r ${ROOT}/utils/settings/* $INSTALL_DIR/utils/settings/

mkdir $INSTALL_DIR/utils/notifications-howto/
cp -r ${ROOT}/utils/notifications-howto/* $INSTALL_DIR/utils/notifications-howto/

cp -r ${ROOT}/utils/mic-permission-requester "$INSTALL_DIR/utils/"
cp ${ROOT}/icon.png "$INSTALL_DIR/utils/mic-permission-requester/"

echo "Make binaries executable..."
chmod +x $INSTALL_DIR/utils/rm.sh
chmod +x $INSTALL_DIR/utils/sleep.sh
chmod +x $INSTALL_DIR/utils/mkdir.sh
chmod +x $INSTALL_DIR/utils/get-scale.sh
chmod +x $INSTALL_DIR/utils/select-file.sh
chmod +x $INSTALL_DIR/launcher.sh
chmod +x $INSTALL_DIR/pushexec
chmod +x $INSTALL_DIR/opt/whatslectron/whatslectron
chmod +x $INSTALL_DIR/opt/whatslectron/chrome_crashpad_handler


# ========================
# STEP 9: BUILD THE CLICK PACKAGE
# ========================
echo "[9/9] Building click package..."
# click build "$INSTALL_DIR"

echo "✅ Preparation done, building the .click package."
 
