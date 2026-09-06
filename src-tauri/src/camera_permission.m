#import <AVFoundation/AVFoundation.h>

void request_camera_access(void) {
    [AVCaptureDevice requestAccessForMediaType:AVMediaTypeVideo
                             completionHandler:^(BOOL granted) {
        (void)granted;
    }];
}
